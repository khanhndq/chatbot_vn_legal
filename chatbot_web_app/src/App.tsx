import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import Chat from "./components/Chat";
import { v4 as uuidv4 } from "uuid";
import "./App.css";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  },
});

function App() {
  const [sessionId, setSessionId] = useState<string>("");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    // Generate a new session ID on component mount
    const newSessionId = uuidv4();
    setSessionId(newSessionId);

    // Store session ID in localStorage for persistence
    localStorage.setItem("chatbotVietLegalSessionId", newSessionId);

    // Check for saved dark mode preference
    const savedDarkMode = localStorage.getItem("darkMode") === "true";
    setIsDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.classList.add("dark");
    }

    console.log("🆕 New chat session created:", newSessionId);
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem("darkMode", String(newDarkMode));

    if (newDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div
        className="min-h-screen font-display transition-colors duration-300"
        style={{
          background: isDarkMode
            ? "linear-gradient(90deg, #1a5a8a, #a54520, #b88924)"
            : "linear-gradient(90deg, #2280c3, #d95c26, #e8b130)",
        }}
      >
        <Chat
          sessionId={sessionId}
          onToggleDarkMode={toggleDarkMode}
          isDarkMode={isDarkMode}
        />
      </div>

      {/* React Query DevTools - only in development */}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

export default App;
