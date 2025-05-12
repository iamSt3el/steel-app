// src/components/Button/Button.jsx
import React from 'react'
import styles from './Button.module.scss'

const Button = ({ Icon, isActive = false, onClick, label }) => {
  return (
    <div className={styles.outterBox}>
      <button 
        className={`${styles.button} ${isActive ? styles.active : ''}`}
        onClick={onClick}
        title={label}
      >
        <Icon className={styles.icon}/>
      </button>
    </div>
  )
}

export default Button