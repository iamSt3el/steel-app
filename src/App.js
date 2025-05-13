import './App.scss';
import Main from './layout/main';
import { ToolProvider } from './context/ToolContext';
import { NotebookProvider } from './context/NotebookContext';

function App() {
  return (
    <NotebookProvider>
      <ToolProvider>
        <div className="App">
          <Main/>
        </div>
      </ToolProvider>
    </NotebookProvider>
  );
}

export default App;