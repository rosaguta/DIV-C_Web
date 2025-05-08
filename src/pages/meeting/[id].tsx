import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.solcon.nl:3478' }
  ],
  iceCandidatePoolSize: 10,
};

type Participant = {
  id: string;
  username: string;
  stream: MediaStream | null;
}

type PeerConnection = {
  peerId: string;
  connection: RTCPeerConnection;
}

type ChatMessage = {
  clientId: string;
  text: string;
}

const Room = () => {
  const [micActive, setMicActive] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isChatConnected, setIsChatConnected] = useState(false)
  const [isCallConnected, setIsCallConnected] = useState(false)
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<any>(null);
  const socketChatRef = useRef<any>(null);
  const peerConnectionsRef = useRef<PeerConnection[]>([]);
  const isRoomCreatorRef = useRef(false);


  const { id: roomName } = router.query;

  useEffect(() => {
    if (!roomName) return;

    // Connect to socket server
    socketRef.current = io(process.env.NEXT_PUBLIC_WEBSOCKET_SERVER_URL, {
      transports: ['websocket'],
      forceNew: true
    });
    socketChatRef.current = io(process.env.NEXT_PUBLIC_WEBSOCKET_CHAT_URL, {
      transports: ['websocket'],
      forceNew: true
    })
    
    socketChatRef.current.on('connect', () => {
      setIsChatConnected(true)
      socketChatRef.current.emit('join', roomName)
      socketChatRef.current.emit('messages', roomName)
    })
    socketChatRef.current.on('messageHistory', handleChatMessage)


    console.log('Connecting to socket server...');

    socketRef.current.on('connect', () => {
      setIsCallConnected(true)
      console.log('Connected to socket server with ID:', socketRef.current.id);
      socketRef.current.emit('join', roomName);
      socketRef.current.emit('messages', roomName);
    });

    // Socket event handlers
    socketRef.current.on('created', handleRoomCreated);
    socketRef.current.on('joined', handleRoomJoined);
    socketRef.current.on('user-list', handleUserList);
    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('user-left', handleUserLeft);
    socketRef.current.on('ready', handlePeerReady);
    socketRef.current.on('message', handleChatMessage);
    socketRef.current.on('full', () => {
      alert('Room is full');
      router.push('/');
    });

    // WebRTC signaling events
    socketRef.current.on('offer', handleReceivedOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);

    const checkConnection = setInterval(() => {
      if (socketRef.current) setIsCallConnected(socketRef.current.connected);
      if (socketChatRef.current) setIsChatConnected(socketChatRef.current.connected);
    }, 5000);

    return () => {
      clearInterval(checkConnection)
      leaveRoom();
    };
  }, [roomName]);
  
  // Setup local video when component mounts
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStreamRef.current]);

  const handleRoomCreated = () => {
    console.log('Room created, setting as host...');
    isRoomCreatorRef.current = true;
    requestMediaAccess();
  };

  const handleRoomJoined = () => {
    console.log('Room joined, requesting media...');
    requestMediaAccess();
  };

  const handleUserList = (users) => {
    console.log('Received user list:', users);
    // Store the current user list to initiate connections later
    users.forEach(user => {
      setParticipants(prev => {
        if (prev.find(p => p.id === user.id)) return prev;
        return [...prev, {
          id: user.id,
          username: user.username || `User ${user.id.substring(0, 5)}`,
          stream: null
        }];
      });
    });
  };

  const handleUserJoined = (user) => {
    console.log(`User joined: ${user.username || user.id}`);


    // Add new participant to state (without stream yet)
    setParticipants(prev => {
      if (prev.find(p => p.id === user.id)) return prev;
      return [...prev, {
        id: user.id,
        username: user.username || `User ${user.id.substring(0, 5)}`,
        stream: null
      }];
    });
  };

  const handlePeerReady = (peerId) => {
    console.log(`Peer is ready: ${peerId}`);
    // Initiate connection to this peer
    createPeerConnection(peerId);
  };

  const handleUserLeft = (userId) => {
    console.log(`User left: ${userId}`);


    // Clean up peer connection
    const connectionIndex = peerConnectionsRef.current.findIndex(pc => pc.peerId === userId);
    if (connectionIndex !== -1) {
      const connection = peerConnectionsRef.current[connectionIndex].connection;
      connection.ontrack = null;
      connection.onicecandidate = null;
      connection.close();


      peerConnectionsRef.current.splice(connectionIndex, 1);
    }


    // Remove from participants list
    setParticipants(prev => prev.filter(p => p.id !== userId));
  };

  const handleChatMessage = (messages) => {
    console.log("Received chat messages:", messages);
    setChat(messages);
  };

  const requestMediaAccess = () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: true
      })
      .then((stream) => {
        console.log('Media access granted');
        localStreamRef.current = stream;


        // Add local user to participants
        const localParticipant: Participant = {
          id: socketRef.current.id,
          username: `You`,
          stream: stream
        };


        setParticipants(prev => {
          if (prev.find(p => p.id === socketRef.current.id)) return prev;
          return [...prev, localParticipant];
        });


        // Update local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }


        // Signal that we're ready to connect
        socketRef.current.emit('ready', roomName);
      })
      .catch((err) => {
        console.error('Error accessing media devices:', err);
        alert('Could not access camera or microphone. Please check permissions.');
      });
  };

  const createPeerConnection = (peerId) => {
    console.log(`Creating peer connection with ${peerId}`);


    // Check if we already have a connection to this peer
    const existingConnection = peerConnectionsRef.current.find(pc => pc.peerId === peerId);
    if (existingConnection) {
      console.log(`Connection to ${peerId} already exists`);
      return existingConnection.connection;
    }


    const peerConnection = new RTCPeerConnection(ICE_SERVERS);


    // Add this connection to our ref array
    peerConnectionsRef.current.push({
      peerId,
      connection: peerConnection
    });


    // Add our local stream tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }


    // Set up ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${peerId}`);
        socketRef.current.emit('ice-candidate', {
          targetId: peerId,
          candidate: event.candidate
        }, roomName);
      }
    };


    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      console.log(`Received tracks from ${peerId}`);


      setParticipants(prev => {
        const updatedParticipants = [...prev];
        const participantIndex = updatedParticipants.findIndex(p => p.id === peerId);


        if (participantIndex !== -1) {
          updatedParticipants[participantIndex] = {
            ...updatedParticipants[participantIndex],
            stream: event.streams[0]
          };
        }


        return updatedParticipants;
      });
    };


    // Create and send offer if we're initiating the connection
    peerConnection
      .createOffer()
      .then(offer => {
        return peerConnection.setLocalDescription(offer);
      })
      .then(() => {
        console.log(`Sending offer to ${peerId}`);
        socketRef.current.emit('offer', {
          targetId: peerId,
          offer: peerConnection.localDescription
        }, roomName);
      })
      .catch(err => {
        console.error('Error creating offer:', err);
      });


    return peerConnection;
  };

  const handleReceivedOffer = ({ offer, from }) => {
    console.log(`Received offer from ${from}`);


    // Create peer connection if it doesn't exist
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);


    // Save the connection
    peerConnectionsRef.current.push({
      peerId: from,
      connection: peerConnection
    });


    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }


    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          targetId: from,
          candidate: event.candidate
        }, roomName);
      }
    };


    // Track handling
    peerConnection.ontrack = (event) => {
      console.log(`Received tracks from ${from}`);


      setParticipants(prev => {
        const updatedParticipants = [...prev];
        const participantIndex = updatedParticipants.findIndex(p => p.id === from);


        if (participantIndex !== -1) {
          updatedParticipants[participantIndex] = {
            ...updatedParticipants[participantIndex],
            stream: event.streams[0]
          };
        } else {
          // If participant isn't in the list yet, add them
          updatedParticipants.push({
            id: from,
            username: `User ${from.substring(0, 5)}`,
            stream: event.streams[0]
          });
        }


        return updatedParticipants;
      });
    };


    // Set remote description (the offer)
    peerConnection
      .setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => {
        // Create answer
        return peerConnection.createAnswer();
      })
      .then(answer => {
        // Set local description (the answer)
        return peerConnection.setLocalDescription(answer);
      })
      .then(() => {
        // Send answer to peer
        socketRef.current.emit('answer', {
          targetId: from,
          answer: peerConnection.localDescription
        }, roomName);
      })
      .catch(err => {
        console.error('Error handling offer:', err);
      });
  };

  const handleAnswer = ({ answer, from }) => {
    console.log(`Received answer from ${from}`);


    // Find the appropriate peer connection
    const peerConnection = peerConnectionsRef.current.find(pc => pc.peerId === from)?.connection;


    if (peerConnection) {
      peerConnection
        .setRemoteDescription(new RTCSessionDescription(answer))
        .catch(err => {
          console.error('Error setting remote description:', err);
        });
    } else {
      console.error(`No peer connection found for ${from}`);
    }
  };

  const handleIceCandidate = ({ candidate, from }) => {
    console.log(`Received ICE candidate from ${from}`);


    // Find the appropriate peer connection
    const peerConnection = peerConnectionsRef.current.find(pc => pc.peerId === from)?.connection;


    if (peerConnection) {
      peerConnection
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch(err => {
          console.error('Error adding ICE candidate:', err);
        });
    } else {
      console.error(`No peer connection found for ${from}`);
    }
  };


  const toggleMediaStream = (type, state) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (track.kind === type) {
          track.enabled = !state;
        }
      });
    }
  };

  const toggleMic = () => {
    toggleMediaStream('audio', micActive);
    setMicActive((prev) => !prev);
  };

  const toggleCamera = () => {
    toggleMediaStream('video', cameraActive);
    setCameraActive((prev) => !prev);
  };

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit('leave', roomName);
      socketRef.current.disconnect();
    }

    // Stop all local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach(({ connection }) => {
      connection.ontrack = null;
      connection.onicecandidate = null;
      connection.close();
    });


    peerConnectionsRef.current = [];


    // Navigate back to home
    // router.push('/');
  };
  const sendChat = (event) => {
    event.preventDefault();
    console.log("Sending message:", input);
    socketChatRef.current.emit('message', input, roomName);
    setInput("");
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  return (
    <div className='main-room'>
      <div className="video-room">
        <div className="video-grid">
          {isCallConnected ? (
            <div>
              {participants.map(participant => (
                <div key={participant.id} className="video-box">
                  {participant.id === socketRef.current?.id ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted={true}
                    />
                  ) : (
                    <VideoPlayer stream={participant.stream} />
                  )}
                  <div className="video-label">
                    {participant.id === socketRef.current?.id ? 'You' : participant.username}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="error-label">no call connection</p>
          )}

        </div>
        <div className="controls">
          <button onClick={toggleMic} type="button" className="control-btn">
            {micActive ? 'Mute' : 'Unmute'}
          </button>
          <button onClick={toggleCamera} type="button" className="control-btn">
            {cameraActive ? 'Stop Video' : 'Start Video'}
          </button>
          <button onClick={leaveRoom} type="button" className="control-btn leave-btn">
            Leave
          </button>
        </div>


      </div>
      <div className="chat-sidebar">
        <div className="chat-header">
          <h3>Chat</h3>
        </div>
        <div className="chat-messages">
          {isChatConnected ? (
            <div>
              {chat.map((msg:ChatMessage, index) => (
                <div key={index} className="chat-message">
                  <span className="sender-name">{msg.clientId}</span>
                  <p>{msg.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className='error-label'>no chat connection</p>
          )}

        </div>
        <form className="chat-input" onSubmit={sendChat}>
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Type a message..."
          />
          <button type="submit">Send</button>
        </form>
      </div>
      <style jsx>{`
        .main-room {
          display: flex;
          width: 100vw
          height: 100vh
          
        }
        .main-room {
          display: flex;
          width: 100vw
          height: 100vh
          
        }
        .video-room {
          flex: 2
          flex: 2
          display: flex;
          flex-direction: column;
          height: 100vh;
          background-color: #1a1a1a;
          color: white;
          position: relative;
          overflow: hidden;
          width: 100%
          }
          width: 100%
          }
        
        .video-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          grid-auto-rows: 1fr;
          gap: 8px;
          padding: 48px 16px 100px 16px;
          width: 100%;
          height: calc(100vh - 80px);
          overflow-y: auto;
        }
        .video-box {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          background-color: #2d2d2d;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          aspect-ratio: 16/9;
        }
        
        video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background-color: #3a3a3a;
        }
        
        .video-label {
          position: absolute;
          bottom: 10px;
          left: 10px;
          background-color: rgba(0, 0, 0, 0.5);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 14px;
        }
        
        .chat-sidebar {
          overflow: scroll
          flex: 1
          overflow: scroll
          flex: 1
          width: 320px;
          height: 100vh;
          height: 100vh;
          background-color: #2d2d2d;
          border-left: 1px solid #3a3a3a;
          display: flex;
          flex-direction: column;
        }
        
        .chat-sidebar.open {
          transform: translateX(0);
        }
        
        .chat-header {
          padding: 16px;
          border-bottom: 1px solid #3a3a3a;
        }
        
        .chat-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 500;
        }
        
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }
        
        .chat-message {
          margin-bottom: 16px;
        }
        
        .sender-name {
          font-weight: 500;
          font-size: 14px;
          color: #2d8cff;
          display: block;
          margin-bottom: 4px;
        }
        
        .chat-message p {
          margin: 0;
          background-color: #3a3a3a;
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 14px;
          color: #f1f1f1;
        }
        
        .chat-input {
          padding: 16px;
          border-top: 1px solid #3a3a3a;
          display: flex;
          gap: 8px;
        }
        
        .chat-input input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #3a3a3a;
          border-radius: 4px;
          background-color: #1a1a1a;
          color: white;
        }
        
        .chat-input button {
          padding: 8px 16px;
          background-color: #2d8cff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .controls {
          position: relative;
          position: relative;
          bottom: 0;
          left: 0;
          width: 100%;
          display: flex;
          justify-content: center;
          gap: 16px;
          padding: 16px;
          background-color: #1a1a1a;
          border-top: 1px solid #3a3a3a;
          z-index: 5;
        }
        
        .control-btn {
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          background-color: #333333;
          color: white;
          font-weight: 500;
          cursor: pointer;
          min-width: 100px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }
        
        .control-btn:hover {
          background-color: #444444;
        }
        
        .leave-btn {
          background-color: #e02d2d;
        }
        
        .leave-btn:hover {
          background-color: #c42323;
        }
        .error-label{
          font-weight: 500;
          color: red
        }
        /* Add a media query for responsive design */
        @media (max-width: 768px) {
          .video-grid {
            grid-template-columns: 1fr;
            padding-bottom: 120px;
          }
          
          .chat-sidebar {
            width: 100%;
          }
          
          .controls {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}

// Helper component to display video
const VideoPlayer = ({ stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);


  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);


  return <video ref={videoRef} autoPlay playsInline />;
};

export default Room;