import React from 'react'
import styles from './Button.module.scss'

const Button = ({Icon}) => {
  return (
    <div className={styles.outterBox}>
        <button className={styles.button}>
            <Icon className = {styles.icon}/>
        </button>
    </div>
  )
}

export default Button
