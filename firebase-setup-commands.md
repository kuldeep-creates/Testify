# Firebase CLI Commands for Email Template Setup

## Install Firebase CLI (if not installed)
```bash
npm install -g firebase-tools
```

## Login to Firebase
```bash
firebase login
```

## Initialize Firebase in your project
```bash
firebase init
```

## Set custom email template via CLI
```bash
# This command can sometimes bypass console restrictions
firebase auth:export users.json
firebase auth:import users.json --hash-algo=SCRYPT
```

## Alternative: Use Firebase Admin SDK
You can also set up email templates using Firebase Admin SDK in a Node.js script.

## Check Firebase Project Settings
```bash
firebase projects:list
firebase use your-project-id
firebase functions:config:get
```

## Deploy custom functions for email handling
```bash
firebase deploy --only functions
```

Note: If console editing is restricted, you might need to:
1. Upgrade to a paid Firebase plan
2. Contact Firebase support
3. Use alternative email services like SendGrid or EmailJS
