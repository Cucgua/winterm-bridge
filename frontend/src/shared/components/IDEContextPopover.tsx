import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useIDEStore } from '../stores/ideStore';
import { copyToClipboard } from '../utils/clipboard';
import { useI18n } from '../i18n';
import { IDEConfig } from '../core/api';

interface IDEContextPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  config: IDEConfig;
}

export const IDEContextPopover: React.FC<IDEContextPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
  config,
}) => {
  const { t } = useI18n();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const projects = useIDEStore((s) => s.projects);
  const matchedIndex = useIDEStore((s) => s.matchedIndex);
  const selectedIndex = useIDEStore((s) => s.selectedIndex);
  const setSelectedIndex = useIDEStore((s) => s.setSelectedIndex);
  const acknowledgeChange = useIDEStore((s) => s.acknowledgeChange);
  const isConnected = useIDEStore((s) => s.isConnected);

  // Compute position synchronously from anchor rect
  const position = useMemo(() => {
    if (!isOpen || !anchorRef.current) return { top: 0, left: 0 };
    const rect = anchorRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      left: Math.max(8, rect.left),
    };
  }, [isOpen, anchorRef, projects]); // re-calc when projects change too (re-render)

  // Acknowledge change when popover opens
  useEffect(() => {
    if (isOpen) {
      acknowledgeChange();
    }
  }, [isOpen, acknowledgeChange]);

  // Recompute on resize
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => forceUpdate((n) => n + 1);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  const handleCopy = async (text: string, field: string) => {
    try {
      await copyToClipboard(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // ignore
    }
  };

  const handleCopyAll = async () => {
    const idx = selectedIndex >= 0 && selectedIndex < projects.length ? selectedIndex : 0;
    if (idx < 0 || projects.length === 0) return;
    const ctx = projects[idx];
    let text = config.copy_template || '';
    text = text.replace(/\{project\.name\}/g, ctx.project?.name || '');
    text = text.replace(/\{project\.basePath\}/g, ctx.project?.basePath || '');
    const activeFile = ctx.openFiles?.find((f) => f.isActive);
    text = text.replace(/\{currentFile\}/g, activeFile?.name || '');
    text = text.replace(/\{currentFile\.path\}/g, activeFile?.path || '');
    text = text.replace(/\{currentFunction\.name\}/g, ctx.currentFunction?.name || '');
    text = text.replace(/\{currentFunction\.signature\}/g, ctx.currentFunction?.signature || '');
    text = text.replace(/\{currentFunction\.className\}/g, ctx.currentFunction?.className || '');
    text = text.replace(/\{currentFunction\.language\}/g, ctx.currentFunction?.language || '');
    await handleCopy(text, 'all');
  };

  const showFields = config.show_fields || [];
  const currentIdx = selectedIndex >= 0 && selectedIndex < projects.length ? selectedIndex : 0;
  const currentProject = projects.length > 0 ? projects[currentIdx] : null;

  const CopyBtn: React.FC<{ field: string; text: string; title?: string }> = ({ field, text, title }) => (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy(text, field); }}
      className="flex-shrink-0 p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
      title={title || t('ide_copy_all')}
    >
      {copiedField === field ? (
        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
          <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
        </svg>
      )}
    </button>
  );

  const popoverContent = (
    <div
      ref={popoverRef}
      style={{ top: position.top, left: position.left, zIndex: 9999 }}
      className="fixed w-96 max-h-[60vh] overflow-y-auto bg-gray-900/95 border border-gray-700 rounded-lg shadow-2xl backdrop-blur-sm"
    >
      {/* Project tabs row */}
      {projects.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700/50 overflow-x-auto">
          {projects.map((p, i) => (
            <button
              key={i}
              onClick={() => setSelectedIndex(i)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded whitespace-nowrap transition-all ${
                i === currentIdx
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              } ${i === matchedIndex ? 'font-bold border-l-2 border-l-purple-400' : ''}`}
            >
              {p.project?.name || `Project ${i + 1}`}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-all whitespace-nowrap"
          >
            {copiedField === 'all' ? (
              <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
              </svg>
            )}
            {t('ide_copy_all')}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="px-3 py-2 space-y-2 text-xs">
        {!isConnected ? (
          <p className="text-gray-500 italic">{t('ide_status_disconnected')}</p>
        ) : projects.length === 0 ? (
          <p className="text-gray-500 italic">{t('ide_no_projects')}</p>
        ) : !currentProject ? (
          <p className="text-gray-500 italic">{t('ide_no_data')}</p>
        ) : (
          <>
            {/* Project name */}
            {showFields.includes('project') && currentProject.project && (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-gray-500">Project: </span>
                  <span className="text-gray-200 font-medium">{currentProject.project.name}</span>
                </div>
                <CopyBtn field="project" text={currentProject.project.name} />
              </div>
            )}

            {/* Project path */}
            {showFields.includes('projectPath') && currentProject.project?.basePath && (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-gray-500">Path: </span>
                  <span className="text-gray-400 font-mono truncate block">{currentProject.project.basePath}</span>
                </div>
                <CopyBtn field="projectPath" text={currentProject.project.basePath} title={t('ide_copy_path')} />
              </div>
            )}

            {/* Open files */}
            {showFields.includes('openFiles') && currentProject.openFiles && currentProject.openFiles.length > 0 && (
              <div>
                <span className="text-gray-500">Files: </span>
                <div className="mt-1 space-y-0.5">
                  {currentProject.openFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 pl-2">
                      <span className={`truncate ${f.isActive ? 'text-purple-300' : 'text-gray-400'}`}>
                        {f.isActive && <span className="mr-1">*</span>}
                        {f.name}
                      </span>
                      <CopyBtn field={`file-${i}`} text={f.path} title={t('ide_copy_file_path')} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current function */}
            {showFields.includes('currentFunction') && currentProject.currentFunction && (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-gray-500">Function: </span>
                  <span className="text-green-300 font-mono text-[11px] break-all">
                    {currentProject.currentFunction.signature}
                  </span>
                  {currentProject.currentFunction.className && (
                    <span className="text-gray-500 ml-1">
                      ({currentProject.currentFunction.className})
                    </span>
                  )}
                  <span className="text-gray-600 ml-1">
                    L{currentProject.currentFunction.lineNumber}
                  </span>
                </div>
                <CopyBtn field="function" text={currentProject.currentFunction.signature} title={t('ide_copy_signature')} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(popoverContent, document.body);
};
