# Chatbot Frontend

A modern, responsive React chatbot interface that connects to the Chatbot backend via WebSocket and REST API.

## 🚀 Features

- **Real-time Chat**: WebSocket-based real-time messaging
- **Modern UI**: Clean, responsive design with Tailwind CSS
- **Type Safety**: Full TypeScript support
- **State Management**: React Query for efficient data fetching and caching
- **Error Handling**: Comprehensive error handling and reconnection logic
- **Responsive Design**: Works on desktop and mobile devices
- **Auto-scroll**: Automatic scrolling to latest messages
- **Connection Status**: Real-time connection status indicator
- **Chat History**: Loads previous chat history on connection

## 🛠️ Tech Stack

- **React 19** - Modern React with hooks
- **TypeScript** - Type safety and better developer experience
- **Tailwind CSS** - Utility-first CSS framework
- **React Query** - Data fetching and state management
- **Socket.io Client** - WebSocket communication
- **Axios** - HTTP client for REST API calls
- **Lodash** - Utility functions
- **date-fns** - Date formatting utilities

## 📦 Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment Setup**:
   Create a `.env` file in the root directory:
   ```bash
   cp env.example .env
   ```
   
   Update the values in `.env`:
   ```env
   REACT_APP_API_URL=http://localhost:3000
   REACT_APP_WEBSOCKET_URL=http://localhost:3000
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

## 🔧 Configuration

### Backend Connection

The frontend connects to the backend on:
- **API Endpoint**: `http://localhost:3000` (configurable via `REACT_APP_API_URL`)
- **WebSocket**: `http://localhost:3000` (configurable via `REACT_APP_WEBSOCKET_URL`)

### Features

- **Auto-reconnection**: Automatically reconnects on connection loss
- **Fallback to REST API**: Uses REST API if WebSocket is unavailable
- **Session Management**: Maintains chat sessions across page reloads
- **Typing Indicators**: Shows when users are typing
- **Error Handling**: Graceful error handling with user-friendly messages

## 🏗️ Project Structure

```
src/
├── components/          # React components
│   ├── Chat.tsx        # Main chat interface
│   ├── Message.tsx     # Individual message component
│   ├── MessageInput.tsx # Message input component
│   └── ConnectionStatus.tsx # Connection status indicator
├── hooks/              # Custom React hooks
│   └── useChat.ts      # Chat state management hook
├── services/           # API and WebSocket services
│   ├── api.service.ts  # REST API service
│   └── websocket.service.ts # WebSocket service
├── types/              # TypeScript type definitions
│   └── chat.ts         # Chat-related interfaces
└── utils/              # Utility functions
```

## 🎯 Usage

### Basic Chat

The chat interface automatically:
1. Creates a new session on page load
2. Connects to the WebSocket server
3. Loads chat history if available
4. Handles real-time messaging

### Sending Messages

- Type your message in the input field
- Press Enter to send
- Use Shift+Enter for new lines
- Messages are sent in real-time via WebSocket

### Connection Management

- **Connected**: Green indicator when WebSocket is active
- **Connecting**: Yellow indicator during connection
- **Disconnected**: Red indicator when connection is lost
- **Reconnect**: Click the reconnect button to manually reconnect

## 🔌 API Integration

### WebSocket Events

- `chat_message`: Send user messages
- `bot_response`: Receive bot responses
- `session_created`: Session creation confirmation
- `session_joined`: Session join confirmation
- `chat_history`: Load chat history
- `typing_start/stop`: Typing indicators

### REST API Endpoints

- `GET /health` - Health check
- `GET /api/messages/history/:sessionId` - Chat history
- `POST /api/messages/send` - Send message (fallback)
- `GET /api/messages/sessions` - Active sessions
- `POST /api/messages/sessions` - Create session

## 🎨 Customization

### Styling

The UI is built with Tailwind CSS and can be customized by:
- Modifying the Tailwind config in `tailwind.config.js`
- Updating component classes
- Adding custom CSS in `src/index.css`

### Components

All components are modular and can be easily customized:
- `Message.tsx`: Message display styling
- `MessageInput.tsx`: Input field appearance
- `Chat.tsx`: Overall layout and structure
- `ConnectionStatus.tsx`: Status indicator styling

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

## 🚀 Deployment

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Serve the build folder**:
   ```bash
   npx serve -s build
   ```

3. **Deploy to your hosting service**:
   - Upload the `build` folder contents
   - Ensure environment variables are set correctly
   - Update backend URLs for production

## 🔍 Troubleshooting

### Common Issues

1. **Connection Failed**:
   - Check if backend is running
   - Verify environment variables
   - Check CORS configuration

2. **Messages Not Sending**:
   - Check WebSocket connection status
   - Verify session ID is valid
   - Check browser console for errors

3. **Styling Issues**:
   - Ensure Tailwind CSS is properly configured
   - Check if CSS is being loaded
   - Verify PostCSS configuration

### Debug Mode

Enable debug logging by checking the browser console. The application logs:
- WebSocket connection events
- API requests and responses
- Error messages
- Connection status changes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is part of the Chatbot ecosystem.

## 🆘 Support

For support and questions:
- Check the troubleshooting section
- Review the backend documentation
- Check browser console for error messages
- Verify network connectivity and CORS settings
