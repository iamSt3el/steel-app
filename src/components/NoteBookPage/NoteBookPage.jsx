// src/components/NoteBookPage/NoteBookPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import styles from './NoteBookPage.module.scss';
import Canvas from '../Canvas';
import { Calendar, Clock, FileText, Undo, RotateCcw } from 'lucide-react';

const NoteBookPage = ({ 
  currentTool = 'pen',
  strokeColor = '#000000',
  strokeWidth = 2,
  eraserWidth = 10,
  onPageChange 
}) => {
  const [canvasData, setCanvasData] = useState(null);
  const [pageTitle, setPageTitle] = useState('Untitled Page');
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 600 });
  const canvasWrapperRef = useRef(null);
  const canvasRef = useRef(null);

  const handleCanvasChange = (dataURL) => {
    setCanvasData(dataURL);
    onPageChange?.(dataURL);
  };

  // Calculate canvas size based on available space
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasWrapperRef.current) {
        const wrapper = canvasWrapperRef.current;
        const rect = wrapper.getBoundingClientRect();
        
        // Calculate available space with some padding
        const padding = 40;
        const availableWidth = rect.width - padding;
        const availableHeight = rect.height - padding;
        
        // Maintain aspect ratio while fitting in available space
        const maxWidth = Math.max(900, availableWidth);
        const maxHeight = Math.max(600, availableHeight);
        
        setCanvasSize({
          width: Math.min(maxWidth, availableWidth),
          height: Math.min(maxHeight, availableHeight)
        });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getCurrentDate = () => {
    return new Date().toLocaleDateString([], { 
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        canvasRef.current?.undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={styles.noteBookPage}>
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <FileText className={styles.pageIcon} />
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => setPageTitle(e.target.value)}
            className={styles.pageTitle}
            placeholder="Untitled Page"
          />
        </div>
        
        <div className={styles.headerCenter}>
          <button 
            className={styles.actionButton}
            onClick={() => canvasRef.current?.undo()}
            title="Undo (Ctrl+Z)"
          >
            <Undo className={styles.buttonIcon} />
            Undo
          </button>
          <button 
            className={styles.actionButton}
            onClick={() => canvasRef.current?.clearCanvas()}
            title="Clear Canvas"
          >
            <RotateCcw className={styles.buttonIcon} />
            Clear
          </button>
        </div>
        
        <div className={styles.headerRight}>
          <div className={styles.timeInfo}>
            <Calendar className={styles.headerIcon} />
            <span>{getCurrentDate()}</span>
          </div>
          <div className={styles.timeInfo}>
            <Clock className={styles.headerIcon} />
            <span>{getCurrentTime()}</span>
          </div>
        </div>
      </div>
      
      <div className={styles.canvasWrapper} ref={canvasWrapperRef}>
        <Canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          currentTool={currentTool}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          eraserWidth={eraserWidth}
          onCanvasChange={handleCanvasChange}
        />
      </div>
      
      <div className={styles.pageFooter}>
        <div className={styles.footerStats}>
          <div className={styles.stat}>
            Current Tool:
            <span className={styles.statValue}>{currentTool}</span>
          </div>
          <div className={styles.stat}>
            Stroke Width:
            <span className={styles.statValue}>{strokeWidth}px</span>
          </div>
          <div className={styles.stat}>
            Color:
            <div 
              className={styles.colorPreview}
              style={{ backgroundColor: strokeColor }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoteBookPage;