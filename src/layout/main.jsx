import React, { useState, useEffect } from 'react';
import styles from './main.module.scss';
import ToolBox from '../components/ToolBox/ToolBox';
import Button from '../components/Button/Button';
import { Menu, Book, ArrowLeft } from 'lucide-react';
import NoteBookPage from '../components/NoteBookPage/NoteBookPage';
import NotebookList from '../components/NotebookList/NotebookList';
import { useToolContext } from '../context/ToolContext';
import { useNotebook } from '../context/NotebookContext';

const Main = () => {
    const { currentTool, strokeColor, strokeWidth, eraserWidth } = useToolContext();
    const { currentNotebook, setCurrentNotebook } = useNotebook();
    const [showNotebookList, setShowNotebookList] = useState(true);

    useEffect(() => {
        if (currentNotebook) {
            setShowNotebookList(false);
        }
    }, [currentNotebook]);

    const handleMenuClick = () => {
        setShowNotebookList(!showNotebookList);
    };

    const handleBackToNotebooks = () => {
        setCurrentNotebook(null);
        setShowNotebookList(true);
    };

    console.log('Current state:', { 
        showNotebookList, 
        hasCurrentNotebook: !!currentNotebook 
    });

    return (
        <div className={styles.main}>
            {showNotebookList ? (
                <NotebookList />
            ) : (
                <>
                    <div className={styles.outterBox}>
                        <div className={styles.menuBox}>
                            <Button 
                                Icon={ArrowLeft} 
                                onClick={handleBackToNotebooks}
                                label="Back to Notebooks"
                            />
                        </div>
                        <div className={styles.toolbox}>
                            <ToolBox />
                        </div>
                    </div>
                    <div className={styles.canvasBox}>
                        {currentNotebook && (
                            <NoteBookPage
                                currentTool={currentTool}
                                strokeColor={strokeColor}
                                strokeWidth={strokeWidth}
                                eraserWidth={eraserWidth}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default Main;