import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import Landing_Page from "./pages/Landing_Page";
import Authentication from "./pages/Authentication";
import { AuthProvider } from "./contexts/AuthContext";
import VideoMeet from "./pages/VideoMeet";

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing_Page />} />

          <Route path="/auth" element={<Authentication />} />

           <Route path='/:url' element={<VideoMeet />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
