# 🚂 Railway Chat App

Real-time chat application deployed on Railway.app with permanent hosting.

## Features
- ✅ Real-time messaging (WebSocket)
- ✅ Image sharing support
- ✅ Multiple chat rooms
- ✅ Message history
- ✅ Never sleeps (Railway keeps it alive)
- ✅ Free SSL certificate
- ✅ Auto-scaling

## Live Demo
- **Main App:** [your-app.railway.app](https://your-app.railway.app)
- **Health Check:** [your-app.railway.app/health](https://your-app.railway.app/health)
- **Railway Status:** [your-app.railway.app/railway](https://your-app.railway.app/railway)

## How to Use
1. Enter your name
2. Create new room or enter existing room ID
3. Share the link with your friend
4. Start chatting!

## Deployment on Railway

### One-Click Deploy
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/yourusername/chat-app-railway)

### Manual Deployment
1. Push this code to GitHub
2. Go to [Railway.app](https://railway.app)
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. Railway will auto-deploy

## Environment Variables
No environment variables needed! Railway auto-configures:
- `PORT` (Auto-set)
- `RAILWAY_ENVIRONMENT` (production/development)
- `RAILWAY_PUBLIC_DOMAIN` (your-app.railway.app)

## Tech Stack
- **Backend:** Node.js, Express, WebSocket
- **Frontend:** HTML5, CSS3, JavaScript
- **Database:** In-memory storage (SQLite ready)
- **Hosting:** Railway.app
- **File Storage:** Local uploads with auto-cleanup

## API Endpoints
- `GET /` - Main chat interface
- `GET /health` - Health check
- `GET /ping` - Server status
- `GET /api/create-room` - Create new room
- `POST /api/upload` - Upload images
- `WebSocket /` - Real-time messaging

## Support
For issues or questions:
1. Check Railway logs
2. Visit `/health` endpoint
3. Contact support

## License
MIT License - Free to use and modify