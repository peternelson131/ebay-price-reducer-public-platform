// Simple toast notification utility
class ToastManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    if (typeof window === 'undefined') return;

    // Create toast container
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    `;
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };

    toast.style.cssText = `
      background: ${colors[type] || colors.info};
      color: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.3s ease-out;
      cursor: pointer;
    `;

    toast.textContent = message;

    // Add close on click
    toast.onclick = () => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => this.container.removeChild(toast), 300);
    };

    this.container.appendChild(toast);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        if (this.container.contains(toast)) {
          toast.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => {
            if (this.container.contains(toast)) {
              this.container.removeChild(toast);
            }
          }, 300);
        }
      }, duration);
    }
  }

  success(message) {
    this.show(message, 'success');
  }

  error(message) {
    this.show(message, 'error');
  }

  warning(message) {
    this.show(message, 'warning');
  }

  info(message) {
    this.show(message, 'info');
  }
}

// Add animations to document
if (typeof window !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

export const toast = new ToastManager();
