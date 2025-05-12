// src/components/NoteBookPage/NoteBookPage.jsx
import React, { useState } from 'react';
import styles from './NoteBookPage.module.scss';
import Canvas from '../Canvas';
import { Calendar, Clock, FileText } from 'lucide-react';

const NoteBookPage = ({ 
  currentTool = 'pen',
  strokeColor = '#000000',
  strokeWidth = 2,
  onPageChange 
}) => {
  const [canvasData, setCanvasData] = useState(null);
  const [pageTitle, setPageTitle] = useState('Untitled Page');

  const handleCanvasChange = (dataURL) => {
    setCanvasData(dataURL);
    onPageChange?.(dataURL);
  };

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
      
      <div className={styles.canvasWrapper}>
        <Canvas
          width={900}
          height={600}
          currentTool={currentTool}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          onCanvasChange={handleCanvasChange}
        />
      </div>
    </div>
  );
};

export default NoteBookPage;