import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    {
      urls: 'stun:openrelay.metered.ca:80',
    }
  ],
};

const Room = () => {
  const [micActive, setMicActive] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [chat, setChat] = useState([])
  const [input, setInput] = useState("")
  const router = useRouter();
  const userVideoRef = useRef();
  const peerVideoRef = useRef();
  const rtcConnectionRef = useRef(null);
  const socketRef = useRef();
  const userStreamRef = useRef();
  const hostRef = useRef(false);


  const { id: roomName } = router.query;

  useEffect(() => {
    // Only initialize socket and join room if roomName exists
    if (!roomName) return;

    // Connect directly to your Express server
    socketRef.current = io('http://localhost:4000', {
      transports: ['websocket'],
      forceNew: true
    });

    console.log('Connecting to socket server...');

    // First we join a room
    socketRef.current.on('connect', () => {
      console.log('Connected to socket server with ID:', socketRef.current.id);
      socketRef.current.emit('join', roomName);
    });

    socketRef.current.on('joined', handleRoomJoined);
    // If the room didn't exist, the server would emit the room was 'created'
    socketRef.current.on('created', handleRoomCreated);
    // Whenever the next person joins, the server emits 'ready'
    socketRef.current.on('ready', initiateCall);
    // Whenever the user recieves a message
    socketRef.current.on('message', (chats) => {
      console.log("all chats", chats);
      setChat(chats);
    });

    // Emitted when a peer leaves the room
    socketRef.current.on('leave', onPeerLeave);

    // If the room is full, we show an alert
    socketRef.current.on('full', () => {
      window.location.href = '/';
    });

    // Event called when a remote user initiating the connection
    socketRef.current.on('offer', handleReceivedOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handlerNewIceCandidateMsg);

    // clear up after
    return () => {
      if (socketRef.current) {
        console.log('Disconnecting socket...');
        socketRef.current.disconnect();
      }

      // Make sure to clean up media streams
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [roomName]);

  const handleRoomJoined = () => {
    console.log('Room joined, requesting media access...');
    requestMediaAccess();
  };

  const handleRoomCreated = () => {
    console.log('Room created, setting as host and requesting media...');
    hostRef.current = true;
    requestMediaAccess();
  };

  const requestMediaAccess = () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: { width: 500, height: 500 },
      })
      .then((stream) => {
        console.log('Media access granted, setting up local video');
        userStreamRef.current = stream;

        // Set the source object for the video element
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        } else {
          console.error('userVideoRef is not available');
        }

        // If we joined (not created) the room, emit ready event
        if (!hostRef.current) {
          socketRef.current.emit('ready', roomName);
        }
      })
      .catch((err) => {
        console.error('Error accessing media devices:', err);
        alert('Could not access camera or microphone. Please check permissions.');
      });
  };

  const sendChat = (event) => {
    event.preventDefault()
    console.log("msg send", input)
    socketRef.current.emit('message', input, roomName)
    setInput("")
  }
  const handleInputChange = (e) => {
    e.preventDefault()
    setInput(e.target.value)
  }
  const initiateCall = () => {
    console.log('Ready to initiate call, host status:', hostRef.current);
    if (hostRef.current) {
      rtcConnectionRef.current = createPeerConnection();

      // Only add tracks if we have a stream
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach(track => {
          rtcConnectionRef.current.addTrack(track, userStreamRef.current);
        });

        rtcConnectionRef.current
          .createOffer()
          .then((offer) => {
            rtcConnectionRef.current.setLocalDescription(offer);
            socketRef.current.emit('offer', offer, roomName);
          })
          .catch((error) => {
            console.error('Error creating offer:', error);
          });
      } else {
        console.error('No local stream available when initiating call');
      }
    }
  };

  const onPeerLeave = () => {
    console.log('Peer left the room');
    // This person is now the creator because they are the only person in the room.
    hostRef.current = true;
    if (peerVideoRef.current && peerVideoRef.current.srcObject) {
      peerVideoRef.current.srcObject
        .getTracks()
        .forEach((track) => track.stop()); // Stops receiving all track of Peer.
      peerVideoRef.current.srcObject = null;
    }

    // Safely closes the existing connection established with the peer who left.
    if (rtcConnectionRef.current) {
      rtcConnectionRef.current.ontrack = null;
      rtcConnectionRef.current.onicecandidate = null;
      rtcConnectionRef.current.close();
      rtcConnectionRef.current = null;
    }
  }

  const createPeerConnection = () => {
    console.log('Creating peer connection');
    // We create a RTC Peer Connection
    const connection = new RTCPeerConnection(ICE_SERVERS);

    // We implement our onicecandidate method for when we received a ICE candidate from the STUN server
    connection.onicecandidate = handleICECandidateEvent;

    // We implement our onTrack method for when we receive tracks
    connection.ontrack = handleTrackEvent;
    return connection;
  };

  const handleReceivedOffer = (offer) => {
    console.log('Received offer, creating answer');
    if (!hostRef.current && userStreamRef.current) {
      rtcConnectionRef.current = createPeerConnection();

      userStreamRef.current.getTracks().forEach(track => {
        rtcConnectionRef.current.addTrack(track, userStreamRef.current);
      });

      rtcConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));

      rtcConnectionRef.current
        .createAnswer()
        .then((answer) => {
          rtcConnectionRef.current.setLocalDescription(answer);
          socketRef.current.emit('answer', answer, roomName);
        })
        .catch((error) => {
          console.error('Error creating answer:', error);
        });
    }
  };

  const handleAnswer = (answer) => {
    console.log('Received answer from peer');
    rtcConnectionRef.current
      .setRemoteDescription(new RTCSessionDescription(answer))
      .catch((err) => console.error('Error setting remote description:', err));
  };

  const handleICECandidateEvent = (event) => {
    if (event.candidate) {
      console.log('Generated ICE candidate');
      socketRef.current.emit('ice-candidate', event.candidate, roomName);
    }
  };

  const handlerNewIceCandidateMsg = (incoming) => {
    console.log('Received ICE candidate');
    // We cast the incoming candidate to RTCIceCandidate
    const candidate = new RTCIceCandidate(incoming);
    rtcConnectionRef.current
      .addIceCandidate(candidate)
      .catch((e) => console.error('Error adding ICE candidate:', e));
  };

  const handleTrackEvent = (event) => {
    console.log('Received tracks from peer');
    // Set the remote stream to the peer video element
    if (peerVideoRef.current) {
      peerVideoRef.current.srcObject = event.streams[0];
    }
  };

  const toggleMediaStream = (type, state) => {
    if (userStreamRef.current) {
      userStreamRef.current.getTracks().forEach((track) => {
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
      socketRef.current.emit('leave', roomName); // Let's the server know that user has left the room.
    }

    if (userVideoRef.current && userVideoRef.current.srcObject) {
      userVideoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      userVideoRef.current.srcObject = null;
    }

    if (peerVideoRef.current && peerVideoRef.current.srcObject) {
      peerVideoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      peerVideoRef.current.srcObject = null;
    }

    // Safely closes the existing connection
    if (rtcConnectionRef.current) {
      rtcConnectionRef.current.ontrack = null;
      rtcConnectionRef.current.onicecandidate = null;
      rtcConnectionRef.current.close();
      rtcConnectionRef.current = null;
    }

    router.push('/');
  };

  return (
    <div className="video-room">
      <div className="video-container">
        <div className="video-box">
          <video autoPlay playsInline ref={userVideoRef} muted={true} />
          <div className="video-label">You</div>
        </div>
        <div className="video-box">
          <video autoPlay playsInline ref={peerVideoRef} />
          <div className="video-label">Peer</div>
        </div>
      </div>
      <div>chat</div>
      <input onChange={handleInputChange} />
      <button onClick={sendChat}>send chat msg</button>
      {chat.map((msg, index) => (
        <p key={index}>{msg}</p>
      ))}
      <div className="controls">
        <button onClick={toggleMic} type="button" className="control-btn">
          {micActive ? 'Mute Mic' : 'UnMute Mic'}
        </button>
        <button onClick={leaveRoom} type="button" className="control-btn leave-btn">
          Leave Room
        </button>
        <button onClick={toggleCamera} type="button" className="control-btn">
          {cameraActive ? 'Stop Camera' : 'Start Camera'}
        </button>
      </div>

      <style jsx>{`
        .video-room {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
        }
        .video-container {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 20px;
          margin-bottom: 20px;
        }
        .video-box {
          position: relative;
          width: 500px;
          height: 375px;
          border: 1px solid #ccc;
          border-radius: 8px;
          overflow: hidden;
        }
        video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background-color: #222;
        }
        .video-label {
          position: absolute;
          bottom: 10px;
          left: 10px;
          background-color: rgba(0,0,0,0.5);
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
        }
        .controls {
          display: flex;
          gap: 15px;
        }
        .control-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          background-color: #4285f4;
          color: white;
          cursor: pointer;
        }
        .leave-btn {
          background-color: #ea4335;
        }
      `}</style>
    </div>
  );
};

export default Room;