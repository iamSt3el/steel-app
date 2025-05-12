// src/components/ToolBox/ToolBox.jsx
import React from 'react'
import styles from './ToolBox.module.scss'
import Button from '../Button/Button'
import { Eraser, MousePointer2, Pen } from 'lucide-react'
import { useToolContext } from '../../context/ToolContext'

const ToolBox = () => {
    const { currentTool, setCurrentTool } = useToolContext();

    const tools = [
        { id: 'pointer', Icon: MousePointer2, label: 'Select' },
        { id: 'pen', Icon: Pen, label: 'Pen' },
        { id: 'eraser', Icon: Eraser, label: 'Eraser' }
    ];

    return (
        <div className={styles.outterBox}>
            {tools.map(tool => (
                <Button 
                    key={tool.id}
                    Icon={tool.Icon} 
                    isActive={currentTool === tool.id}
                    onClick={() => setCurrentTool(tool.id)}
                    label={tool.label}
                />
            ))}
        </div>
    )
}

export default ToolBox