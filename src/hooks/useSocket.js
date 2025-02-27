// hooks/useSocket.js
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const useSocket = () => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Create the socket connection
    const socketConnection = io("http://localhost:4000", {
      transports: ["websocket"],
      // Prevent multiple reconnection attempts
      reconnectionAttempts: 5,
      // Wait longer between reconnection attempts
      reconnectionDelay: 1000,
      // Override auto connect to control when connection happens
      autoConnect: false,
      // Force a new connection, don't reuse existing connection
      forceNew: true
    });

    // Connect manually after setup
    socketConnection.connect();

    socketConnection.on("connect", () => {
      console.log("Connected to socket server:", socketConnection.id);
    });

    socketConnection.on("connect_error", (err) => {
      console.log("Connection error:", err);
    });

    setSocket(socketConnection);

    // Clean up function - very important
    return () => {
      console.log("Cleaning up socket connection");
      if (socketConnection) {
        // Ensure we properly close the connection
        socketConnection.disconnect();
      }
    };
  }, []); // Empty dependency array ensures this runs once

  return socket;
};

export default useSocket;