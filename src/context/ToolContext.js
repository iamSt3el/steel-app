// src/context/ToolContext.jsx
import React, { createContext, useContext, useState } from 'react';

const ToolContext = createContext();

export const useToolContext = () => {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error('useToolContext must be used within a ToolProvider');
  }
  return context;
};

export const ToolProvider = ({ children }) => {
  const [currentTool, setCurrentTool] = useState('pen');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);

  return (
    <ToolContext.Provider
      value={{
        currentTool,
        setCurrentTool,
        strokeColor,
        setStrokeColor,
        strokeWidth,
        setStrokeWidth,
      }}
    >
      {children}
    </ToolContext.Provider>
  );
};