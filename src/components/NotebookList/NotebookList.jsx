import React, { useState } from 'react';
import { useNotebook } from '../../context/NotebookContext';
import { Book, Plus, Trash, Calendar } from 'lucide-react';
import styles from './NotebookList.module.scss';

const NotebookList = () => {
  const { 
    notebooks, 
    createNotebook, 
    setCurrentNotebook,
    currentNotebook,
    deleteNotebook 
  } = useNotebook();
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  
  const handleCreateNotebook = () => {
    if (newNotebookName.trim()) {
      createNotebook(newNotebookName.trim());
      setNewNotebookName('');
      setShowCreateForm(false);
    }
  };
  
  const handleSelectNotebook = (notebook) => {
    setCurrentNotebook(notebook);
  };
  
  const handleDeleteNotebook = (e, notebookId) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this notebook?')) {
      deleteNotebook(notebookId);
    }
  };
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2><Book size={24} /> My Notebooks</h2>
        <button 
          className={styles.createBtn}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          <Plus size={20} />
          New Notebook
        </button>
      </div>
      
      {showCreateForm && (
        <div className={styles.createForm}>
          <input
            type="text"
            value={newNotebookName}
            onChange={(e) => setNewNotebookName(e.target.value)}
            placeholder="Enter notebook name..."
            className={styles.nameInput}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateNotebook()}
          />
          <div className={styles.formButtons}>
            <button onClick={handleCreateNotebook} className={styles.saveBtn}>
              Create
            </button>
            <button 
              onClick={() => {
                setShowCreateForm(false);
                setNewNotebookName('');
              }}
              className={styles.cancelBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      <div className={styles.notebookGrid}>
        {notebooks.map(notebook => (
          <div 
            key={notebook.id}
            className={`${styles.notebookCard} ${
              currentNotebook?.id === notebook.id ? styles.active : ''
            }`}
            onClick={() => handleSelectNotebook(notebook)}
          >
            <div className={styles.cardHeader}>
              <Book size={32} className={styles.notebookIcon} />
              <button 
                className={styles.deleteBtn}
                onClick={(e) => handleDeleteNotebook(e, notebook.id)}
              >
                <Trash size={16} />
              </button>
            </div>
            <h3 className={styles.notebookName}>{notebook.name}</h3>
            <div className={styles.notebookInfo}>
              <span className={styles.pageCount}>
                {notebook.pages.length} pages
              </span>
              <span className={styles.date}>
                <Calendar size={14} />
                {new Date(notebook.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
        
        {notebooks.length === 0 && (
          <div className={styles.emptyState}>
            <Book size={48} className={styles.emptyIcon} />
            <p>No notebooks yet</p>
            <p>Create your first notebook to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotebookList;