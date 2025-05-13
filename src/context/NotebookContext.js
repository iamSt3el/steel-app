// src/context/NotebookContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const NotebookContext = createContext();

export const useNotebook = () => {
  const context = useContext(NotebookContext);
  if (!context) {
    throw new Error('useNotebook must be used within a NotebookProvider');
  }
  return context;
};

export const NotebookProvider = ({ children }) => {
  const [notebooks, setNotebooks] = useState(() => {
    try {
      const saved = localStorage.getItem('notebooks');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error loading notebooks from localStorage:', error);
      return [];
    }
  });
  
  const [currentNotebook, setCurrentNotebook] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Save to localStorage whenever notebooks change
  useEffect(() => {
    try {
      localStorage.setItem('notebooks', JSON.stringify(notebooks));
    } catch (error) {
      console.error('Error saving notebooks to localStorage:', error);
    }
  }, [notebooks]);
  
  const createNotebook = (name) => {
    const newNotebook = {
      id: Date.now(),
      name,
      pages: [
        { 
          id: 0, 
          title: 'Index',
          type: 'index',
          data: null 
        },
        { 
          id: 1, 
          title: 'Page 1',
          type: 'canvas',
          data: null 
        }
      ],
      createdAt: new Date().toISOString()
    };
    setNotebooks(prev => [...prev, newNotebook]);
    setCurrentNotebook(newNotebook);
    setCurrentPage(0);
    return newNotebook;
  };
  
  const addPage = (title = '') => {
    if (!currentNotebook) return;
    
    const newPage = {
      id: currentNotebook.pages.length,
      title: title || `Page ${currentNotebook.pages.length}`,
      type: 'canvas',
      data: null
    };
    
    const updatedNotebook = {
      ...currentNotebook,
      pages: [...currentNotebook.pages, newPage]
    };
    
    setNotebooks(prev => prev.map(nb => 
      nb.id === currentNotebook.id ? updatedNotebook : nb
    ));
    
    setCurrentNotebook(updatedNotebook);
  };
  
  const savePage = (pageId, data) => {
    if (!currentNotebook) return;
    
    const updatedNotebook = {
      ...currentNotebook,
      pages: currentNotebook.pages.map(page => 
        page.id === pageId ? { ...page, data } : page
      )
    };
    
    setNotebooks(prev => prev.map(nb => 
      nb.id === currentNotebook.id ? updatedNotebook : nb
    ));
    
    setCurrentNotebook(updatedNotebook);
  };
  
  const updatePageTitle = (pageId, title) => {
    if (!currentNotebook) return;
    
    const updatedNotebook = {
      ...currentNotebook,
      pages: currentNotebook.pages.map(page => 
        page.id === pageId ? { ...page, title } : page
      )
    };
    
    setNotebooks(prev => prev.map(nb => 
      nb.id === currentNotebook.id ? updatedNotebook : nb
    ));
    
    setCurrentNotebook(updatedNotebook);
  };
  
  const deleteNotebook = (notebookId) => {
    setNotebooks(prev => prev.filter(nb => nb.id !== notebookId));
    if (currentNotebook?.id === notebookId) {
      setCurrentNotebook(null);
      setCurrentPage(0);
    }
  };
  
  return (
    <NotebookContext.Provider value={{
      notebooks,
      currentNotebook,
      currentPage,
      setCurrentNotebook,
      setCurrentPage,
      createNotebook,
      addPage,
      savePage,
      updatePageTitle,
      deleteNotebook
    }}>
      {children}
    </NotebookContext.Provider>
  );
};