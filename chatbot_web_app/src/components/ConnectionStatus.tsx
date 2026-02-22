import React from 'react';

interface ConnectionStatusProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectAttempts?: number;
  onReconnect?: () => void;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ 
  status, 
  reconnectAttempts = 0, 
  onReconnect 
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: 'check_circle',
          text: 'Connected',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-700'
        };
      case 'connecting':
        return {
          icon: 'sync',
          text: 'Connecting...',
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
          borderColor: 'border-yellow-200 dark:border-yellow-700',
          animate: true
        };
      case 'disconnected':
        return {
          icon: 'cancel',
          text: 'Disconnected',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-700'
        };
      case 'error':
        return {
          icon: 'error',
          text: 'Error',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-700'
        };
      default:
        return {
          icon: 'help',
          text: 'Unknown',
          color: 'text-slate-600 dark:text-slate-400',
          bgColor: 'bg-slate-50 dark:bg-slate-800',
          borderColor: 'border-slate-200 dark:border-slate-700'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`inline-flex items-center px-3 py-1.5 rounded-full border ${config.bgColor} ${config.borderColor}`}>
      <span className={`material-symbols-outlined text-base mr-1.5 ${config.color} ${config.animate ? 'animate-spin' : ''}`}>
        {config.icon}
      </span>
      <span className={`text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
      
      {status === 'disconnected' && onReconnect && (
        <button
          onClick={onReconnect}
          className="ml-2 px-2 py-0.5 text-xs bg-primary text-white rounded-md hover:bg-orange-600 transition-colors duration-200"
        >
          Reconnect
        </button>
      )}
      
      {status === 'error' && reconnectAttempts > 0 && (
        <span className="ml-2 text-xs opacity-70">
          ({reconnectAttempts})
        </span>
      )}
    </div>
  );
};

export default ConnectionStatus;

