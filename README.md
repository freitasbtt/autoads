# Meta Ads Campaign Management Platform

A multi-tenant platform for creating, managing, and monitoring advertising campaigns across Meta's platforms (Facebook, Instagram, WhatsApp).

## Features

- 🔐 **Role-Based Access Control (RBAC)**: Admin and client roles with granular permissions
- 🔄 **OAuth Integration**: Automatic resource fetching from Meta and Google Drive
- 📊 **Campaign Management**: Create and monitor campaigns with real-time status tracking
- 🤖 **n8n Automation**: Bidirectional webhook integration for workflow automation
- 👥 **User Management**: Admin panel for managing users and system configuration
- 🎨 **Modern UI**: Microsoft Fluent Design System with dark mode support

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Shadcn UI + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: Passport.js + bcrypt + session-based auth
- **External APIs**: Meta Marketing API, WhatsApp Cloud API, Google Drive API

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed
- Meta App credentials (App ID and Secret)
- Google OAuth credentials (Client ID and Secret)
- n8n instance (optional, for automation)

### Running with Docker Compose

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Create a `.env` file (required, used automatically by Docker Compose):
```env
SESSION_SECRET=generate-a-strong-random-string
DATABASE_URL=postgresql://metaads:metaads_password@postgres:5432/metaads
NODE_ENV=production
PORT=5000
PUBLIC_APP_URL=https://<your-https-domain>
FORCE_HTTPS=true
```

3. Start the application:
```bash
docker-compose up -d
```

4. Access the application at `http://localhost:5000`

5. Default admin credentials (seeded automatically on first start):
   - Email: `admin@test.com`
   - Password: `password`

### Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Stop and remove volumes (WARNING: deletes database data)
docker-compose down -v
```

## Local Development (Replit)

### Prerequisites

- Node.js 20+
- PostgreSQL database

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (automatically configured on Replit):
```env
DATABASE_URL=<your-postgres-connection-string>
SESSION_SECRET=<random-secret-key>
```

3. Push database schema:
```bash
npm run db:push
```

4. Start development server:
```bash
npm run dev
```

5. Access at `https://<your-repl-url>.replit.dev`

## Initial Configuration

### 1. Login as Admin
- Email: `admin@test.com`
- Password: `password`

### 2. Configure OAuth (Admin Panel)

Navigate to **Admin > Configurações** and enter:

#### Meta App Configuration
1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create/select your app
3. Add OAuth redirect URI: `https://<your-url>/auth/meta/callback`
4. Copy App ID and Secret to Admin panel

#### Google OAuth Configuration
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable Google Drive API
3. Create OAuth 2.0 Client ID
4. Add redirect URI: `https://<your-url>/auth/google/callback`
5. Copy Client ID and Secret to Admin panel

#### n8n Webhook (Optional)
1. In your n8n instance, create a webhook trigger
2. Copy the webhook URL
3. Paste it in Admin panel

### 3. Connect OAuth

Navigate to **Integrações** and:
1. Click "Conectar OAuth" for Meta Ads API
2. Authorize the required permissions
3. Click "Conectar OAuth" for Google Drive
4. Authorize Drive access

### 4. Verify Resources

Go to **Recursos** page to see imported:
- Ad Accounts
- Pages
- Instagram Business Accounts
- WhatsApp Numbers
- Lead Forms
- Google Drive Folders

## User Management

### Creating New Users (Admin Only)

1. Navigate to **Admin > Usuários**
2. Click "Criar Novo Usuário"
3. Fill in user details:
   - Name
   - Email
   - Password
   - Role (admin or client)
4. Click "Criar Usuário"

**Note**: Public registration is disabled. Only admins can create users.

### User Roles

- **Admin**: Full access to all features including user management, settings, and OAuth configuration
- **Client**: Access to campaigns, audiences, resources, and integrations

## Campaign Workflow

### Creating a Campaign

1. Navigate to **Campanhas > Nova Campanha**
2. Fill in campaign details:
   - Title
   - Objective
   - Message content
   - Select resources (Page, Instagram, WhatsApp, Drive folder, etc.)
3. Click "Criar Campanha"
4. Campaign is automatically sent to n8n (if configured)

### Campaign Status

- **Draft** (gray): Created but not sent to n8n
- **Pending** (yellow): Sent to n8n, awaiting processing
- **Active** (green): Confirmed active by n8n
- **Error** (red): n8n reported an error
- **Paused/Completed**: Final states

### Resending to n8n

Click the send icon (paper plane) on any campaign to resend to n8n.

## n8n Integration

### Receiving Campaign Data

n8n receives webhook at the configured URL with payload:
```json
{
  "campaign_id": "1",
  "title": "Campaign Title",
  "page_id": "123456",
  "instagram_user_id": "789012",
  "whatsapp_number_id": "345678",
  "drive_folder_id": "folder-id",
  "leadgen_form_id": "901234",
  "message": "Campaign message content",
  ...
}
```

### Sending Status Updates

Add HTTP Request node at end of n8n workflow:

**Method**: POST  
**URL**: `https://<your-app-url>/api/webhooks/n8n/status`  
**Body** (JSON):
```json
{
  "campaign_id": "1",
  "status": "active",
  "status_detail": "Campaign successfully created in Meta Ads"
}
```

**Valid Status Values**: `active`, `error`, `paused`, `completed`

## Database Schema

### Main Tables

- **users**: User accounts with RBAC (admin/client roles)
- **tenants**: Multi-tenant isolation
- **campaigns**: Campaign metadata and configuration
- **resources**: Meta resources (accounts, pages, etc.)
- **audiences**: Custom audience definitions
- **integrations**: Encrypted OAuth credentials
- **app_settings**: System-wide configuration

## Security

- **Password Hashing**: bcrypt with salt rounds
- **Session Management**: Secure cookie-based sessions
- **Multi-tenant Isolation**: Row-level security via tenant_id
- **Encrypted Secrets**: OAuth tokens encrypted at rest
- **RBAC**: Endpoint-level authorization
- **CSRF Protection**: Session state validation for OAuth
- **appsecret_proof**: Meta API request signing

## Project Structure

```
.
├── client/               # Frontend React application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── contexts/     # React contexts (Auth, etc.)
│   │   ├── pages/        # Page components
│   │   └── lib/          # Utilities and hooks
├── server/               # Backend Express application
│   ├── index.ts          # Entry point
│   ├── routes.ts         # API routes
│   ├── storage.ts        # Data layer (IStorage)
│   └── auth.ts           # Authentication logic
├── shared/               # Shared types and schemas
│   └── schema.ts         # Drizzle schema definitions
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # Docker Compose configuration
└── drizzle.config.ts     # Drizzle ORM configuration
```

## API Endpoints

### Public Endpoints
- `POST /api/login` - User login
- `POST /api/register` - (Disabled) Use Admin panel instead

### Protected Endpoints
- `GET /api/user` - Get current user
- `POST /api/logout` - Logout
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/send-webhook` - Resend to n8n
- `GET /api/resources` - List resources
- `GET /api/audiences` - List audiences
- `POST /api/audiences` - Create audience

### Admin-Only Endpoints
- `GET /api/admin/settings` - Get system settings
- `PUT /api/admin/settings` - Update system settings
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### OAuth Endpoints
- `GET /auth/meta` - Initiate Meta OAuth
- `GET /auth/meta/callback` - Meta OAuth callback
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - Google OAuth callback

### Webhook Endpoints
- `POST /api/webhooks/n8n` - Send data to n8n
- `POST /api/webhooks/n8n/status` - Receive status from n8n

## Troubleshooting

### Docker Issues

**Container won't start**:
```bash
docker-compose logs app
docker-compose logs postgres
```

**Database connection error**:
- Ensure postgres service is healthy: `docker-compose ps`
- Check DATABASE_URL in docker-compose.yml

**Port already in use**:
```bash
# Change port in docker-compose.yml
ports:
  - "3000:5000"  # Use port 3000 instead
```

### OAuth Issues

**"Callback URL mismatch"**:
- Verify callback URLs in Meta/Google match exactly
- Include protocol: `https://`
- No trailing slashes

**"Missing permissions"**:
- Check Meta App has all required permissions
- Permissions: `ads_management`, `pages_show_list`, `instagram_basic`, `whatsapp_business_management`, `leads_retrieval`

**"Resources not appearing"**:
- Go to Recursos page to verify imports
- Check that OAuth completed successfully
- Verify integration credentials in database

### n8n Webhook Issues

**"Webhook not active"**:
- In n8n, click "Execute workflow" button
- Test webhooks require manual activation

**Status updates not received**:
- Verify callback URL is correct
- Check n8n HTTP Request node configuration
- Ensure payload matches expected format

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Proprietary - All rights reserved
