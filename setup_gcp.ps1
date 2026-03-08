# Google Cloud Setup Script for Ghost Assistant
# Usage: .\setup_gcp.ps1

$PROJECT_ID = "ghost-assistant-mvp-2026"
$BILLING_ACCOUNT_ID = "01368E-26CF4B-62DF82" # The open account found

Write-Host "Setting up Google Cloud Project: $PROJECT_ID" -ForegroundColor Cyan

# 1. Set Project
Write-Host "Step 1: Setting active project..."
gcloud config set project $PROJECT_ID

# 2. Link Billing (Attempt)
Write-Host "Step 2: Attempting to link billing..."
try {
    gcloud beta billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT_ID
    Write-Host "Billing linked successfully!" -ForegroundColor Green
} catch {
    Write-Host "Could not link billing automatically. Please link it manually in the console:" -ForegroundColor Yellow
    Write-Host "https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID" -ForegroundColor White
    Read-Host "Press Enter after you have linked the billing account..."
}

# 3. Enable APIs
Write-Host "Step 3: Enabling necessary APIs..."
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com firestore.googleapis.com

# 4. Create Secrets
Write-Host "Step 4: Creating Secrets..."

function Create-Secret ($name) {
    $exists = gcloud secrets list --filter="name:$name" --format="value(name)"
    if ($exists) {
        Write-Host "Secret $name already exists."
    } else {
        Write-Host "Creating secret $name..."
        gcloud secrets create $name --replication-policy="automatic"
    }
    
    $hasVersion = gcloud secrets versions list $name --limit=1 --format="value(name)"
    if (-not $hasVersion) {
        $val = Read-Host "Enter value for $name (hidden)" -AsSecureString
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($val)
        $Plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        $Plain | gcloud secrets versions add $name --data-file=-
        Write-Host "Secret version added."
    }
}

Create-Secret "OPENAI_API_KEY"
Create-Secret "GROQ_API_KEY"
Create-Secret "YOOKASSA_SHOP_ID"
Create-Secret "YOOKASSA_SECRET_KEY"

# 5. Deploy
Write-Host "Step 5: Deploying Backend..."
Set-Location backend
gcloud functions deploy ghost-api --gen2 --runtime=nodejs20 --region=us-central1 --source=. --entry-point=api --trigger-http --allow-unauthenticated

Write-Host "Setup Complete!" -ForegroundColor Green
