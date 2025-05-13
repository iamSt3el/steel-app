import React, { useState, useRef, useEffect } from 'react';
import styles from './NoteBookPage.module.scss';
import Canvas from '../Canvas';
import { useNotebook } from '../../context/NotebookContext';
import { Plus, Edit2, Book } from 'lucide-react';

const NoteBookPage = ({ 
  currentTool = 'pen',
  strokeColor = '#000000',
  strokeWidth = 2,
  eraserWidth = 10
}) => {
  const { 
    currentNotebook, 
    currentPage, 
    setCurrentPage,
    savePage,
    addPage,
    updatePageTitle
  } = useNotebook();
  
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState('next');
  const [showAddPage, setShowAddPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const canvasRef = useRef(null);
  
  if (!currentNotebook) {
    return (
      <div className={styles.noNotebook}>
        <Book size={48} />
        <p>No notebook selected</p>
      </div>
    );
  }
  
  const pages = currentNotebook.pages;
  
  const nextPage = () => {
    if (currentPage < pages.length - 1 && !isFlipping) {
      setFlipDirection('next');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(currentPage + 1);
        setIsFlipping(false);
      }, 600);
    }
  };
  
  const prevPage = () => {
    if (currentPage > 0 && !isFlipping) {
      setFlipDirection('prev');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(currentPage - 1);
        setIsFlipping(false);
      }, 600);
    }
  };
  
  const goToPage = (pageIndex) => {
    if (pageIndex !== currentPage && !isFlipping) {
      setFlipDirection(pageIndex > currentPage ? 'next' : 'prev');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(pageIndex);
        setIsFlipping(false);
      }, 600);
    }
  };
  
  const handleCanvasChange = (dataURL) => {
    savePage(pages[currentPage].id, dataURL);
  };
  
  const handleAddPage = () => {
    if (newPageTitle.trim()) {
      addPage(newPageTitle.trim());
      setNewPageTitle('');
      setShowAddPage(false);
      // Go to the new page
      setTimeout(() => {
        goToPage(pages.length);
      }, 100);
    }
  };
  
  const handleEditTitle = (pageId, newTitle) => {
    updatePageTitle(pageId, newTitle);
  };
  
  return (
    <div className={styles.notebookContainer}>
      {/* Page title outside notebook */}
      <h1 className={styles.pageTitle}>
        {pages[currentPage]?.title || 'Untitled'}
      </h1>
      
      <div className={styles.notebookWrapper}>
        {/* Notebook container */}
        <div className={styles.notebook}>
          {/* Page content */}
          <div className={styles.pageContent}>
            {/* Current page */}
            <div className={`${styles.page} ${isFlipping ? styles.flipping : ''}`}>
              {pages[currentPage]?.type === 'index' ? (
                <div className={styles.indexPage}>
                  <div className={styles.indexContent}>
                    {pages.slice(1).map((page, idx) => (
                      <div 
                        key={page.id}
                        onClick={() => goToPage(idx + 1)}
                        className={styles.indexItem}
                      >
                        <span className={styles.indexTitle}>{page.title}</span>
                        <span className={styles.indexPageNum}>Page {idx + 1}</span>
                      </div>
                    ))}
                    
                    {/* Add new page button */}
                    <div className={styles.addPageSection}>
                      {!showAddPage ? (
                        <button 
                          className={styles.addPageBtn}
                          onClick={() => setShowAddPage(true)}
                        >
                          <Plus size={20} />
                          Add New Page
                        </button>
                      ) : (
                        <div className={styles.addPageForm}>
                          <input
                            type="text"
                            value={newPageTitle}
                            onChange={(e) => setNewPageTitle(e.target.value)}
                            placeholder="Enter page title..."
                            className={styles.pageInput}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddPage()}
                          />
                          <button onClick={handleAddPage} className={styles.saveBtn}>
                            Save
                          </button>
                          <button 
                            onClick={() => {
                              setShowAddPage(false);
                              setNewPageTitle('');
                            }}
                            className={styles.cancelBtn}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.canvasPage}>
                  <Canvas
                    ref={canvasRef}
                    width={800}
                    height={900}
                    currentTool={currentTool}
                    strokeColor={strokeColor}
                    strokeWidth={strokeWidth}
                    eraserWidth={eraserWidth}
                    onCanvasChange={handleCanvasChange}
                    key={`page-${pages[currentPage]?.id}`}
                  />
                </div>
              )}
            </div>
          </div>
          
          {/* Page indicator */}
          <div className={styles.pageIndicator}>
            Page <strong>{currentPage + 1}</strong> of <strong>{pages.length}</strong>
          </div>
        </div>
        
        {/* Navigation buttons - outside the notebook */}
        <button 
          className={`${styles.navButton} ${styles.prevButton}`}
          onClick={prevPage}
          disabled={currentPage === 0 || isFlipping}
        >
          ‹
        </button>
        
        <button 
          className={`${styles.navButton} ${styles.nextButton}`}
          onClick={nextPage}
          disabled={currentPage === pages.length - 1 || isFlipping}
        >
          ›
        </button>
        
        {/* Page tabs */}
        <div className={styles.pageTabs}>
          {pages.map((page, index) => (
            <div 
              key={page.id}
              onClick={() => !isFlipping && goToPage(index)}
              className={`${styles.pageTab} ${index === currentPage ? styles.active : ''}`}
              title={page.title}
            >
              {index === 0 ? 'I' : index}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NoteBookPage;