// src/App.js
import './App.scss';
import Main from './layout/main';
import { ToolProvider } from './context/ToolContext';

function App() {
  return (
    <ToolProvider>
      <div className="App">
        <Main/>
      </div>
    </ToolProvider>
  );
}

export default App;