import React, { createContext, useContext, ReactNode } from 'react';
import { toast, Toaster } from 'sonner';

interface NotificationContextType {
  showSuccessPopup: (title: string, message: string) => void;
  showErrorPopup: (title: string, message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const showSuccessPopup = (title: string, message: string) => {
    toast.success(title, {
      description: message,
      duration: 3000,
    });
  };

  const showErrorPopup = (title: string, message: string) => {
    toast.error(title, {
      description: message,
      duration: 4000,
    });
  };

  return (
    <NotificationContext.Provider value={{ showSuccessPopup, showErrorPopup }}>
      {children}
      <Toaster
        position="top-center"
        expand={true}
        closeButton={true}
        visibleToasts={4}
        gap={8}
        offset={16}
        toastOptions={{
          style: {
            fontFamily: 'inherit',
            background: 'white',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            padding: '12px 44px 12px 14px',
          },
        }}
      />
      <style>{`
        [data-sonner-toaster] {
          --width: 400px;
        }
        [data-sonner-toast] {
          transition: all 0.3s ease !important;
        }
        [data-sonner-toast] [data-content] {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        [data-sonner-toast] [data-icon] {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        [data-sonner-toast][data-type="success"] [data-icon] {
          color: #3b82f6;
        }
        [data-sonner-toast][data-type="error"] [data-icon] {
          color: #ef4444;
        }
        [data-sonner-toast][data-type="warning"] [data-icon] {
          color: #f59e0b;
        }
        [data-sonner-toast][data-type="info"] [data-icon] {
          color: #6b7280;
        }
        [data-sonner-toast] [data-title] {
          font-weight: 600;
          color: #111827;
          font-size: 0.875rem;
          line-height: 1.3;
        }
        [data-sonner-toast] [data-description] {
          color: #6b7280;
          font-size: 0.8rem;
          margin-top: 2px;
          line-height: 1.4;
        }
        [data-sonner-toast] button[data-close-button] {
          position: absolute !important;
          left: unset !important;
          right: 10px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          background: transparent !important;
          border: none !important;
          color: #c0c0c0 !important;
          opacity: 1 !important;
          width: 26px !important;
          height: 26px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 6px !important;
          transition: all 0.15s ease !important;
          cursor: pointer !important;
          padding: 0 !important;
        }
        [data-sonner-toast] button[data-close-button]:hover {
          color: #ef4444 !important;
          background: rgba(239, 68, 68, 0.1) !important;
        }
        [data-sonner-toast] button[data-close-button] svg {
          width: 16px !important;
          height: 16px !important;
        }
      `}</style>
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
