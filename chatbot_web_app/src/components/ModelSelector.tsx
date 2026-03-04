import React, { useState, useRef, useEffect } from 'react';
import { LLMModelType, LLMModelInfo } from '../types/chat';

interface ModelSelectorProps {
  selectedModel: LLMModelType;
  onModelChange: (model: LLMModelType) => void;
  availableModels: LLMModelInfo[];
  disabled?: boolean;
}

const MODEL_ICONS: Record<LLMModelType, string> = {
  openai: 'smart_toy',
  claude: 'psychology',
  gemini: 'auto_awesome',
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  availableModels,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (availableModels.length === 0) return null;

  const currentModel = availableModels.find(m => m.id === selectedModel);
  const displayName = currentModel?.name || selectedModel;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary dark:hover:border-primary dark:hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        title="Select AI model"
      >
        <span className="material-symbols-outlined text-base">
          {MODEL_ICONS[selectedModel] || 'smart_toy'}
        </span>
        <span className="hidden sm:inline">{displayName}</span>
        <span className="material-symbols-outlined text-sm">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              AI Model
            </span>
          </div>
          {availableModels.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                onModelChange(model.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                model.id === selectedModel
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                {MODEL_ICONS[model.id] || 'smart_toy'}
              </span>
              <span>{model.name}</span>
              {model.id === selectedModel && (
                <span className="material-symbols-outlined text-base ml-auto">check</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
