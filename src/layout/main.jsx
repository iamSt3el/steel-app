// src/layout/main.jsx
import React from 'react'
import styles from './main.module.scss'

import ToolBox from '../components/ToolBox/ToolBox'
import Button from '../components/Button/Button'
import { Menu } from 'lucide-react'
import NoteBookPage from '../components/NoteBookPage/NoteBookPage'
import { useToolContext } from '../context/ToolContext'

const Main = () => {
    const { currentTool, strokeColor, strokeWidth } = useToolContext();

    return (
        <div className={styles.main}>
            <div className={styles.outterBox}>
                <div className={styles.menuBox}>
                    <Button Icon={Menu} />
                </div>
                <div className={styles.toolbox}>
                    <ToolBox />
                </div>
            </div>
            <div className={styles.canvasBox}>
                <NoteBookPage
                    currentTool={currentTool}
                    strokeColor={strokeColor}
                    strokeWidth={strokeWidth}
                />
            </div>
        </div>
    )
}

export default Main