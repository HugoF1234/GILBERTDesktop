import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode | ((isActive: boolean) => React.ReactNode);
}

interface AnimatedTabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const AnimatedTabs: React.FC<AnimatedTabsProps> = ({
  tabs,
  value,
  onChange,
  className = '',
}) => {
  const [tabDimensions, setTabDimensions] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeIndex = tabs.findIndex((tab) => tab.value === value);
    if (activeIndex !== -1 && tabRefs.current[activeIndex] && containerRef.current) {
      const tabElement = tabRefs.current[activeIndex];
      const containerRect = containerRef.current.getBoundingClientRect();
      const tabRect = tabElement!.getBoundingClientRect();

      setTabDimensions({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });
    }
  }, [value, tabs]);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center p-1 bg-slate-100 rounded-xl ${className}`}
      style={{ gap: '2px' }}
    >
      {/* Sliding indicator */}
      <motion.div
        className="absolute top-1 bottom-1 bg-white rounded-[10px] shadow-sm"
        initial={false}
        animate={{
          left: tabDimensions.left,
          width: tabDimensions.width,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30,
        }}
        style={{
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        }}
      />

      {/* Tab buttons */}
      {tabs.map((tab, index) => {
        const isActive = value === tab.value;
        return (
          <button
            key={tab.value}
            ref={(el) => (tabRefs.current[index] = el)}
            onClick={() => onChange(tab.value)}
            className={`
              relative z-10 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[10px]
              transition-colors duration-200 outline-none
              ${isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}
            `}
            style={{ minWidth: 'fit-content' }}
          >
            {tab.icon && (
              <motion.span
                initial={false}
                animate={{
                  scale: isActive ? 1 : 0.9,
                  opacity: isActive ? 1 : 0.7,
                }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center"
              >
                {typeof tab.icon === 'function' ? tab.icon(isActive) : tab.icon}
              </motion.span>
            )}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default AnimatedTabs;
