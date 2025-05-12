import React from 'react'
import styles from './ToolBox.module.scss'
import Button from '../Button/Button'
import { Eraser, MousePointer2, Pen } from 'lucide-react'

const ToolBox = () => {
    return (
        <div className={styles.outterBox}>
            <Button Icon={MousePointer2} />
            <Button Icon={Pen} />
            <Button Icon={Eraser}/>
        </div>
    )
}

export default ToolBox
