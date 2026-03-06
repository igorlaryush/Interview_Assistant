const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');
const OpenAI = require('openai');
const Groq = require('groq-sdk');
const cors = require('cors')({ origin: true });
const { YooCheckout } = require('@a2seven/yoo-checkout');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

// Define Secrets (Firebase v2 syntax)
const groqApiKey = defineSecret('GROQ_API_KEY');
const openaiApiKey = defineSecret('OPENAI_API_KEY');
const yookassaShopId = defineSecret('YOOKASSA_SHOP_ID');
const yookassaSecretKey = defineSecret('YOOKASSA_SECRET_KEY');

const secrets = [groqApiKey, openaiApiKey, yookassaShopId, yookassaSecretKey];

// Main API Entry Point
exports.api = onRequest({ 
    secrets: ["GROQ_API_KEY", "OPENAI_API_KEY", "YOOKASSA_SHOP_ID", "YOOKASSA_SECRET_KEY"],
    region: 'us-central1',
    cors: true 
}, async (req, res) => {
    
    // 1. AUTHENTICATION CHECK
    const authHeader = req.headers.authorization;
    let user = null;
    
    // Webhook bypass auth
    if (req.body && req.body.event && req.body.event.startsWith('payment.')) {
         return handleYooKassaWebhook(req, res);
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        user = decodedToken;
      } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    } else {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    // 1.5 CHECK USAGE / SUBSCRIPTION
    const db = admin.firestore();
    const userRef = db.collection('users').doc(user.uid);
    let userData = null;
    
    try {
        const doc = await userRef.get();
        if (!doc.exists) {
            // Create initial user document if it doesn't exist
            userData = {
                email: user.email || null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                subscription: { tier: 'free', nextResetDate: null },
                tokenBalance: 10000, // starting free tokens
            };
            await userRef.set(userData);
        } else {
            userData = doc.data();
            
            if (userData.tokenBalance === undefined) userData.tokenBalance = 10000; // fallback
            if (!userData.subscription) userData.subscription = { tier: 'free', nextResetDate: null };

            // Subscription Reset Logic (if past reset date)
            if (userData.subscription.nextResetDate) {
                const nextReset = userData.subscription.nextResetDate.toDate();
                if (new Date() > nextReset) {
                    const isPremium = userData.subscription.tier === 'premium';
                    userData.tokenBalance = isPremium ? 1000000 : 10000;
                    const newResetDate = new Date();
                    newResetDate.setDate(newResetDate.getDate() + 30);
                    userData.subscription.nextResetDate = admin.firestore.Timestamp.fromDate(newResetDate);
                    
                    await userRef.update({
                        tokenBalance: userData.tokenBalance,
                        'subscription.nextResetDate': userData.subscription.nextResetDate
                    });
                }
            }
        }
        
        // Pre-Check
        if (req.body && (req.body.action === 'transcribe_and_advice' || req.body.action === 'analyze_image')) {
            if (userData.tokenBalance <= 0) {
                 return res.status(403).json({ error: 'Insufficient Tokens. Please top up.' });
            }
        }

    } catch (err) {
        console.error("Error accessing Firestore:", err);
        return res.status(500).json({ error: 'Database error while checking usage.' });
    }

    // Helper to deduct tokens and respond
    const deductTokensAndRespond = async (result) => {
        const tokensUsed = result.tokensUsed || 0;
        let newBalance = (userData.tokenBalance || 0) - tokensUsed;
        
        if (newBalance < 0) newBalance = 0; // Prevent negative balance
        
        // Update firestore
        if (tokensUsed > 0) {
            await userRef.update({
                tokenBalance: newBalance
            });
        }

        result.tokenBalance = newBalance;
        result.lowBalanceWarning = newBalance < 10000;
        
        return res.json(result);
    };

    // 2. ROUTING
    const { action, data, model, systemPrompt, models, price, purchaseType } = req.body;

    try {
      if (action === 'transcribe_and_advice') {
        const result = await handleAudioProcess(data, model, systemPrompt, models);
        return deductTokensAndRespond(result);
      } 
      else if (action === 'analyze_image') {
        const result = await handleImageProcess(data, model, systemPrompt, models);
        return deductTokensAndRespond(result);
      }
      else if (action === 'create_payment') {
        const type = purchaseType || 'subscription';
        const result = await handleCreatePayment(user.uid, price, type);
        return res.json(result);
      } 
      else if (action === 'cancel_subscription') {
        const result = await handleCancelSubscription(user.uid);
        return res.json(result);
      }
      else {
        return res.status(400).json({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
});

// --- Handlers ---

async function handleCreatePayment(userId, amountValue, purchaseType = 'subscription') {
    let shopId, secretKey;
    try {
        shopId = process.env.YOOKASSA_SHOP_ID;
        secretKey = process.env.YOOKASSA_SECRET_KEY;
        if (!shopId || !secretKey) {
            throw new Error("Missing credentials");
        }
    } catch (e) {
        throw new Error("Could not fetch YooKassa credentials.");
    }

    const checkout = new YooCheckout({ shopId: shopId, secretKey: secretKey });
    const idempotenceKey = Date.now().toString() + '_' + userId;

    const description = purchaseType === 'topup' ? 'Token Top-up - Ghost Assistant' : 'Premium Subscription - Ghost Assistant';
    const amount = purchaseType === 'topup' ? (amountValue || '250.00') : (amountValue || '500.00');

    const createPayload = {
        amount: {
            value: amount,
            currency: 'RUB'
        },
        payment_method_data: {
            type: 'bank_card'
        },
        confirmation: {
            type: 'redirect',
            return_url: 'https://interview-assistant-26e0f.web.app/payment-success' // Updated to match Firebase project
        },
        description: description,
        metadata: {
            userId: userId,
            planId: 'premium',
            purchaseType: purchaseType
        },
        capture: true
    };

    if (purchaseType === 'subscription') {
        createPayload.save_payment_method = true;
    }

    try {
        const payment = await checkout.createPayment(createPayload, idempotenceKey);
        
        // Save payment intent to Firestore
        const db = admin.firestore();
        await db.collection('users').doc(userId).collection('payments').doc(payment.id).set({
            paymentId: payment.id,
            status: payment.status,
            amount: payment.amount.value,
            purchaseType: purchaseType,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { 
            confirmationUrl: payment.confirmation.confirmation_url,
            paymentId: payment.id 
        };
    } catch (error) {
        console.error("YooKassa Error:", error);
        throw new Error("Failed to create payment intent.");
    }
}

async function handleCancelSubscription(userId) {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    
    if (!doc.exists) return { error: "User not found" };
    const userData = doc.data();
    
    const paymentMethodId = userData.subscription && userData.subscription.paymentMethodId;
    
    // Unlink locally
    await userRef.update({
        'subscription.paymentMethodId': admin.firestore.FieldValue.delete(),
        'subscription.status': 'canceled_by_user'
    });

    // Unlink in YooKassa
    if (paymentMethodId) {
        try {
            const shopId = process.env.YOOKASSA_SHOP_ID;
            const secretKey = process.env.YOOKASSA_SECRET_KEY;
            const authHeader = 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
            
            const response = await fetch(`https://api.yookassa.ru/v3/payment_methods/${paymentMethodId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': authHeader,
                    'Idempotence-Key': Date.now().toString() + '_' + userId
                }
            });
            if (!response.ok) {
                console.error("YooKassa unlinking non-200:", await response.text());
            }
        } catch (err) {
            console.error("Failed to delete payment method in YooKassa:", err.message);
        }
    }
    
    return { success: true, message: "Subscription canceled successfully." };
}

async function handleYooKassaWebhook(req, res) {
    try {
        const event = req.body;
        const eventType = event.event;
        const object = event.object;
        
        const db = admin.firestore();
        
        // Log all webhooks for debugging/auditing
        await db.collection('webhook_events').add({
            eventType: eventType,
            objectId: object.id,
            payload: event,
            receivedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Try to get userId from metadata (works for payments and refunds if metadata was passed)
        let userId = object.metadata ? object.metadata.userId : null;
        
        if (userId && object.id) {
            const userRef = db.collection('users').doc(userId);
            
            // Handle Payment Events
            if (eventType.startsWith('payment.')) {
                await userRef.collection('payments').doc(object.id).set({
                    paymentId: object.id,
                    status: object.status,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            if (eventType === 'payment.succeeded') {
                const purchaseType = object.metadata.purchaseType || 'subscription';

                // Save payment method if it was requested
                if (object.payment_method && object.payment_method.saved) {
                    await userRef.update({
                        'subscription.paymentMethodId': object.payment_method.id
                    });
                }

                if (purchaseType === 'subscription') {
                    // Upgrade subscription
                    const expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + 30);
                    
                    await userRef.update({
                        'subscription.tier': object.metadata.planId || 'premium',
                        'subscription.nextResetDate': admin.firestore.Timestamp.fromDate(expiresAt),
                        'subscription.status': 'active',
                        tokenBalance: 1000000 // 1 million tokens for premium
                    });
                    console.log(`Successfully processed subscription payment ${object.id} and upgraded user ${userId}`);
                } else if (purchaseType === 'topup') {
                    await userRef.update({
                        tokenBalance: admin.firestore.FieldValue.increment(500000) // Top-up adds 500k tokens
                    });
                    console.log(`Successfully processed top-up payment ${object.id} for user ${userId}`);
                }
            } 
            else if (eventType === 'payment.canceled') {
                console.log(`Payment ${object.id} was canceled for user ${userId}`);
            }
            else if (eventType === 'payment.waiting_for_capture') {
                console.log(`Payment ${object.id} is waiting for capture for user ${userId}`);
            }
            else if (eventType === 'refund.succeeded') {
                await userRef.collection('refunds').doc(object.id).set({
                    refundId: object.id,
                    paymentId: object.payment_id,
                    status: object.status,
                    amount: object.amount.value,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Refund ${object.id} succeeded for user ${userId}`);
            }
        } else if (eventType === 'payment_method.active') {
            // This event fires when a card is successfully linked without a charge
            // Payment methods don't always have metadata depending on how they were created,
            // but if they do, we link it to the user.
            userId = object.metadata ? object.metadata.userId : null;
            if (userId) {
                await db.collection('users').doc(userId).update({
                    'subscription.paymentMethodId': object.id,
                    'subscription.status': 'active'
                });
                console.log(`Successfully saved payment method ${object.id} for user ${userId}`);
            }
        }
        
        // Always return 200 OK to YooKassa so they don't retry
        return res.status(200).send('OK');
    } catch (error) {
        console.error("Webhook processing error:", error);
        return res.status(200).send('Error but acknowledged');
    }
}

async function handleAudioProcess(audioBase64, modelType, systemPrompt, modelsConfig) {
  // 1. Get Secrets
  let groqKey, openaiKey;
  try {
      groqKey = process.env.GROQ_API_KEY;
      openaiKey = process.env.OPENAI_API_KEY;
  } catch (e) {
      return { advice: "Error: Could not fetch API Keys." };
  }

  // 2. Decode Audio
  const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.webm`);
  try {
      const buffer = Buffer.from(audioBase64, 'base64');
      fs.writeFileSync(tempFilePath, buffer);
  } catch (e) {
      return { advice: "Error saving audio file." };
  }

  let transcription = null;
  let adviceResult = null;

  // 3. Transcription (Try Groq first for speed)
  try {
      transcription = await transcribeAudioGroq(tempFilePath, groqKey);
  } catch (e) {
      console.error("Groq Transcription failed, falling back to OpenAI:", e);
  }

  if (!transcription) {
      try {
          transcription = await transcribeAudioOpenAI(tempFilePath, openaiKey);
      } catch (e) {
           console.error("OpenAI Transcription failed:", e);
           try { fs.unlinkSync(tempFilePath); } catch(e) {}
           return { advice: "Error: Transcription failed.", tokensUsed: 0 };
      }
  }

  // Clean up temp file
  try { fs.unlinkSync(tempFilePath); } catch(e) {}

  // 4. Get Advice (Prefer Groq, fallback to OpenAI)
  // Check if transcription is empty or just noise
  if (!transcription || transcription.trim().length < 2) {
      return { transcription: "", advice: "-", tokensUsed: 0 };
  }

  // Whisper Hallucination Filter
  const cleanText = transcription.toLowerCase().trim().replace(/[.,!?'"]/g, "");
  const hallucinations = [
      "thank you", "thanks for watching", "спасибо за просмотр", "thank you for watching",
      "подписывайтесь", "subscribe", "subscribe to my channel", "thanks", "спасибо", "субтитры", 
      "subtitles", "amaraorg"
  ];
  if (hallucinations.includes(cleanText) || cleanText.startsWith("транскрипция ") || cleanText.startsWith("субтитры ")) {
      console.log("Filtered out Whisper hallucination:", transcription);
      return { transcription: "", advice: "-", tokensUsed: 0 };
  }

  try {
      const groqModelName = (modelsConfig && modelsConfig.groqTextAdvice) ? modelsConfig.groqTextAdvice : "llama-3.3-70b-versatile";
      adviceResult = await getGroqAdvice(transcription, groqKey, systemPrompt, groqModelName);
  } catch (e) {
      console.error("Groq Advice failed, falling back to OpenAI:", e);
      try {
          const openaiModelName = (modelsConfig && modelsConfig.openaiGpt5Mini) ? modelsConfig.openaiGpt5Mini : "gpt-5.2-mini";
          adviceResult = await getOpenAIAdvice(transcription, openaiKey, systemPrompt, openaiModelName);
      } catch (e2) {
          return { transcription, advice: "Error generating advice.", tokensUsed: 0 };
      }
  }

  return { transcription, advice: adviceResult.content, tokensUsed: adviceResult.tokensUsed };
}

async function handleImageProcess(imageBase64, language, systemPrompt, modelsConfig) {
  let groqKey;
  try {
      groqKey = process.env.GROQ_API_KEY;
  } catch (e) {
      return { advice: "Error: Could not fetch GROQ_API_KEY.", tokensUsed: 0 };
  }

  // Ensure data URL format
  const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

  try {
      const groqVisionModelName = (modelsConfig && modelsConfig.groqVision) ? modelsConfig.groqVision : "llama-3.2-90b-vision-preview";
      const adviceResult = await getGroqVisionAdvice(imageUrl, systemPrompt, groqKey, groqVisionModelName);
      return { advice: adviceResult.content, tokensUsed: adviceResult.tokensUsed };
  } catch (e) {
      console.error("Image processing error:", e);
      return { advice: "Error processing image.", tokensUsed: 0 };
  }
}

// --- Helpers ---

async function transcribeAudioGroq(filePath, apiKey) {
    const groq = new Groq({ apiKey });
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-large-v3-turbo",
      temperature: 0,
      response_format: "verbose_json",
    });
    return transcription.text;
}

async function transcribeAudioOpenAI(filePath, apiKey) {
    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
      condition_on_previous_text: false
    });
    return transcription.text;
}

async function getGroqAdvice(userText, apiKey, systemPrompt, modelName) {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this text: "${userText}"` }
      ],
      model: modelName,
      temperature: 0.6,
      max_tokens: 300,
    });
    return {
        content: completion.choices[0]?.message?.content || "No advice generated.",
        tokensUsed: completion.usage?.total_tokens || 0
    };
}

async function getOpenAIAdvice(userText, apiKey, systemPrompt, modelName) {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this text: "${userText}"` }
      ],
      model: modelName,
      max_tokens: 300,
      temperature: 0.6
    });
    return {
        content: completion.choices[0].message.content,
        tokensUsed: completion.usage?.total_tokens || 0
    };
}

async function getGroqVisionAdvice(imageUrl, promptText, apiKey, modelName) {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: promptText },
                    { type: "image_url", image_url: { url: imageUrl } }
                ]
            }
        ],
        model: modelName,
        temperature: 0.1,
        max_completion_tokens: 1024,
        top_p: 1,
    });
    return {
        content: completion.choices[0]?.message?.content || "No solution generated.",
        tokensUsed: completion.usage?.total_tokens || 0
    };
}