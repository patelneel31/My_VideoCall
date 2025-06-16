import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { Badge, IconButton, TextField } from "@mui/material";
import { Button } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import "./video.css";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import server from "../environment";

const server_url = server;

let connections = {};

const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VideoMeet() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();
  const videoRef = useRef([]);

  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [screenAvailable, setScreenAvailable] = useState(false);
  const [video, setVideo] = useState(false);
  const [audio, setAudio] = useState(false);
  const [screen, setScreen] = useState(false);
  const [showModal, setModal] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    getPermissions();
    return () => {
      // Cleanup on unmount
      if (localVideoref.current?.srcObject) {
        localVideoref.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (video !== undefined && audio !== undefined) {
      getUserMedia();
    }
  }, [video, audio]);

  useEffect(() => {
    if (screen !== undefined) {
      if (screen) {
        getDisplayMedia();
      } else {
        getUserMedia();
      }
    }
  }, [screen]);

  const getPermissions = async () => {
    try {
      const videoPermission = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      setVideoAvailable(!!videoPermission);
      
      const audioPermission = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setAudioAvailable(!!audioPermission);
      
      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);
    } catch (error) {
      console.error("Error getting permissions:", error);
      setVideoAvailable(false);
      setAudioAvailable(false);
      setScreenAvailable(false);
    }
  };

  const getMedia = () => {
    setVideo(videoAvailable);
    setAudio(audioAvailable);
    connectToSocketServer();
  };

  const getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices.getUserMedia({ video, audio })
        .then(getUserMediaSuccess)
        .catch(console.error);
    } else {
      stopMediaTracks();
    }
  };

  const getDisplayMedia = () => {
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      .then(getDisplayMediaSuccess)
      .catch(console.error);
  };

  const getUserMediaSuccess = (stream) => {
    stopMediaTracks();
    window.localStream = stream;
    localVideoref.current.srcObject = stream;
    updatePeerConnections(stream);
    setupTrackEndHandlers(stream, false);
  };

  const getDisplayMediaSuccess = (stream) => {
    stopMediaTracks();
    window.localStream = stream;
    localVideoref.current.srcObject = stream;
    updatePeerConnections(stream);
    setupTrackEndHandlers(stream, true);
  };

  const stopMediaTracks = () => {
    if (localVideoref.current?.srcObject) {
      localVideoref.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const updatePeerConnections = (stream) => {
    Object.keys(connections).forEach(id => {
      if (id === socketIdRef.current) return;
      
      try {
        connections[id].getSenders().forEach(sender => {
          if (sender.track.kind === 'video' || sender.track.kind === 'audio') {
            connections[id].removeTrack(sender);
          }
        });
        
        stream.getTracks().forEach(track => {
          connections[id].addTrack(track, stream);
        });
        
        connections[id].createOffer()
          .then(description => connections[id].setLocalDescription(description))
          .then(() => {
            socketRef.current.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription })
            );
          })
          .catch(console.error);
      } catch (e) {
        console.error("Error updating peer connection:", e);
      }
    });
  };

  const setupTrackEndHandlers = (stream, isScreen) => {
    stream.getTracks().forEach(track => {
      track.onended = () => {
        if (isScreen) {
          setScreen(false);
        } else {
          setVideo(false);
          setAudio(false);
        }
        stopMediaTracks();
        const blackSilence = new MediaStream([
          black({ width: 640, height: 480 }),
          silence()
        ]);
        window.localStream = blackSilence;
        localVideoref.current.srcObject = window.localStream;
        updatePeerConnections(window.localStream);
      };
    });
  };

  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);

    if (fromId === socketIdRef.current || !connections[fromId]) return;

    if (signal.sdp) {
      connections[fromId]
        .setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(() => {
          if (signal.sdp.type === "offer") {
            connections[fromId]
              .createAnswer()
              .then(description => connections[fromId].setLocalDescription(description))
              .then(() => {
                socketRef.current.emit(
                  "signal",
                  fromId,
                  JSON.stringify({ sdp: connections[fromId].localDescription })
                );
              })
              .catch(console.error);
          }
        })
        .catch(console.error);
    }

    if (signal.ice) {
      connections[fromId]
        .addIceCandidate(new RTCIceCandidate(signal.ice))
        .catch(console.error);
    }
  };

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);
    socketRef.current.on("chat-message", addMessage);

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("user-left", (id) => {
        setVideos(videos => videos.filter(video => video.socketId !== id));
        if (connections[id]) {
          connections[id].close();
          delete connections[id];
        }
      });

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach(socketListId => {
          if (connections[socketListId] || socketListId === socketIdRef.current) return;

          connections[socketListId] = new RTCPeerConnection(peerConfigConnections);
          
          connections[socketListId].onicecandidate = (event) => {
            if (event.candidate) {
              socketRef.current.emit(
                "signal",
                socketListId,
                JSON.stringify({ ice: event.candidate })
              );
            }
          };

          connections[socketListId].ontrack = (event) => {
            setVideos(prevVideos => {
              const existing = prevVideos.find(v => v.socketId === socketListId);
              if (existing) {
                return prevVideos.map(v => 
                  v.socketId === socketListId ? { ...v, stream: event.streams[0] } : v
                );
              }
              return [...prevVideos, {
                socketId: socketListId,
                stream: event.streams[0],
                autoplay: true,
                playsinline: true
              }];
            });
          };

          if (window.localStream) {
            window.localStream.getTracks().forEach(track => {
              connections[socketListId].addTrack(track, window.localStream);
            });
          }

          if (id === socketIdRef.current) {
            Object.keys(connections).forEach(id2 => {
              if (id2 === socketIdRef.current) return;
              
              connections[id2].createOffer()
                .then(description => connections[id2].setLocalDescription(description))
                .then(() => {
                  socketRef.current.emit(
                    "signal",
                    id2,
                    JSON.stringify({ sdp: connections[id2].localDescription })
                  );
                })
                .catch(console.error);
            });
          }
        });
      });
    });
  };

  const silence = () => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };

  const black = ({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    const stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  const handleVideo = () => setVideo(!video);
  const handleAudio = () => setAudio(!audio);
  const handleScreen = () => setScreen(!screen);

  const handleEndCall = () => {
    stopMediaTracks();
    Object.values(connections).forEach(pc => pc.close());
    if (socketRef.current) socketRef.current.disconnect();
    window.location.href = "/";
  };

  const addMessage = (data, sender, socketIdSender) => {
    setMessages(prevMessages => [...prevMessages, { sender, data }]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages(prev => prev + 1);
    }
  };

  const sendMessage = () => {
    if (message.trim() && socketRef.current) {
      socketRef.current.emit("chat-message", message, username);
      setMessage("");
    }
  };

  const connect = () => {
    if (username.trim()) {
      setAskForUsername(false);
      getMedia();
    }
  };

  return (
    <div className="video-meet-container">
      {askForUsername ? (
        <div className="username-modal">
          <h2>Enter into Lobby</h2>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
            fullWidth
            margin="normal"
          />
          <Button 
            variant="contained" 
            onClick={connect}
            disabled={!username.trim()}
          >
            Connect
          </Button>
          <video ref={localVideoref} autoPlay muted playsInline className="preview-video"></video>
        </div>
      ) : (
        <div className="meet-container">
          {showModal && (
            <div className="chat-room">
              <div className="chat-container">
                <div className="chat-header">
                  <h2>Chat</h2>
                  <IconButton onClick={() => setModal(false)}>
                    <span>&times;</span>
                  </IconButton>
                </div>
                <div className="chat-messages">
                  {messages.length > 0 ? (
                    messages.map((item, index) => (
                      <div key={index} className="message">
                        <strong>{item.sender}: </strong>
                        <span>{item.data}</span>
                      </div>
                    ))
                  ) : (
                    <p>No messages yet</p>
                  )}
                </div>
                <div className="chat-input">
                  <TextField
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    label="Type a message"
                    variant="outlined"
                    fullWidth
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <Button 
                    variant="contained" 
                    onClick={sendMessage}
                    disabled={!message.trim()}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="video-grid">
            <video
              ref={localVideoref}
              autoPlay
              muted
              playsInline
              className="local-video"
            ></video>
            
            {videos.map((video) => (
              <video
                key={video.socketId}
                ref={ref => ref && video.stream && (ref.srcObject = video.stream)}
                autoPlay
                playsInline
                className="remote-video"
              />
            ))}
          </div>

          <div className="controls">
            <IconButton onClick={handleVideo} className={`control-button ${!video && 'disabled'}`}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            
            <IconButton onClick={handleAudio} className={`control-button ${!audio && 'disabled'}`}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            
            {screenAvailable && (
              <IconButton onClick={handleScreen} className={`control-button ${!screen && 'disabled'}`}>
                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
              </IconButton>
            )}
            
            <IconButton onClick={handleEndCall} className="end-call">
              <CallEndIcon />
            </IconButton>
            
            <Badge badgeContent={newMessages} color="error">
              <IconButton 
                onClick={() => setModal(!showModal)} 
                className="chat-button"
              >
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}