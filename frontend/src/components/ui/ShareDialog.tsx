import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Share2,
  Search,
  X,
  UserPlus,
  Check,
  Loader2,
  Users,
  Eye,
  Pencil,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Contact, type ShareRole } from '@/services/shareService';

const GILBERT_BLUE = '#3B82F6';
const GILBERT_BLUE_LIGHT = '#EFF6FF';

export interface SharePermissions {
  role: ShareRole;
  includeTranscript: boolean;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  contacts: Contact[];
  onShare: (shareIds: string[], permissions: SharePermissions) => Promise<void>;
  hasTranscript?: boolean;
  hasSummary?: boolean;
  maxRole?: ShareRole;  // Maximum role user can grant (reader can only share as reader)
}

export function ShareDialog({
  open,
  onOpenChange,
  meetingTitle,
  contacts,
  onShare,
  hasTranscript = true,
  hasSummary = true,
  maxRole = 'editor',  // Default: can share as either reader or editor
}: ShareDialogProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [shareIdInput, setShareIdInput] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [manualShareIds, setManualShareIds] = useState<string[]>([]);
  const [isSharing, setIsSharing] = useState(false);

  // Permission states
  const [role, setRole] = useState<ShareRole>('reader');
  const [includeTranscript, setIncludeTranscript] = useState(false);

  // Track failed images to show fallback
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Filter contacts based on search
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.contact_name.toLowerCase().includes(query) ||
        c.contact_share_id?.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  const toggleContact = (shareId: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(shareId)) {
        next.delete(shareId);
      } else {
        next.add(shareId);
      }
      return next;
    });
  };

  const addManualShareId = () => {
    const id = shareIdInput.trim();
    if (id && !manualShareIds.includes(id) && !selectedContacts.has(id)) {
      setManualShareIds((prev) => [...prev, id]);
      setShareIdInput('');
    }
  };

  const removeManualShareId = (id: string) => {
    setManualShareIds((prev) => prev.filter((s) => s !== id));
  };

  const handleShare = async () => {
    const allShareIds = [
      ...Array.from(selectedContacts),
      ...manualShareIds,
    ];
    if (allShareIds.length === 0) return;

    setIsSharing(true);
    try {
      await onShare(allShareIds, { role, includeTranscript });
      // Reset state
      setSelectedContacts(new Set());
      setManualShareIds([]);
      setSearchQuery('');
      setRole('reader');
      setIncludeTranscript(false);
      onOpenChange(false);
    } finally {
      setIsSharing(false);
    }
  };

  const totalSelected = selectedContacts.size + manualShareIds.length;

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setSelectedContacts(new Set());
        setManualShareIds([]);
        setSearchQuery('');
        setShareIdInput('');
        setRole('reader');
        setIncludeTranscript(false);
        setFailedImages(new Set());
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Block sharing if no summary and role is reader (can only share transcript)
  const cannotShareSummary = !hasSummary && role === 'reader';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md max-h-[90vh] sm:max-h-[85vh] flex flex-col p-0 !rounded-xl" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0 p-4 sm:p-6 pb-3 sm:pb-4 rounded-t-xl">
          <DialogTitle className="flex items-center gap-2.5 sm:gap-3 text-lg sm:text-xl font-semibold text-gray-900">
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: GILBERT_BLUE_LIGHT }}
            >
              <Share2 className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: GILBERT_BLUE }} />
            </div>
            Partager l'échange
          </DialogTitle>
          <p className="text-xs sm:text-sm text-gray-500 mt-1.5 sm:mt-2 ml-[46px] sm:ml-[52px] truncate">
            {meetingTitle}
          </p>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 pb-4"
            >
              {/* Manual Share ID input */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Ajouter par Share ID
                </label>
                <div className="flex gap-2">
                  <Input
                    value={shareIdInput}
                    onChange={(e) => setShareIdInput(e.target.value)}
                    placeholder="Entrer un Share ID..."
                    className="h-10 sm:h-11 flex-1 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManualShareId();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={addManualShareId}
                    disabled={!shareIdInput.trim()}
                    className="h-10 w-10 sm:h-11 sm:w-11 p-0 shrink-0"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Manual Share IDs chips */}
              {manualShareIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {manualShareIds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm border border-blue-100"
                    >
                      <span className="truncate max-w-[150px]">{id}</span>
                      <button
                        onClick={() => removeManualShareId(id)}
                        className="hover:bg-blue-100 rounded p-0.5 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Contacts section */}
              {contacts.length > 0 && (
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                    Ou sélectionner des contacts
                  </label>

                  {/* Search contacts */}
                  <div className="relative mb-2 sm:mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher..."
                      className="h-10 sm:h-11 pl-10 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-500"
                    />
                  </div>

                  {/* Contacts list */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50/50 overflow-hidden">
                    <ScrollArea className="h-32 sm:h-36">
                      <div className="p-1.5 sm:p-2 space-y-1">
                        {filteredContacts.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-gray-500">
                            <Users className="h-6 w-6 sm:h-8 sm:w-8 mb-2 opacity-50" />
                            <p className="text-xs sm:text-sm">Aucun contact trouvé</p>
                          </div>
                        ) : (
                          filteredContacts.map((contact) => {
                            const isSelected = selectedContacts.has(contact.contact_share_id);
                            return (
                              <button
                                key={contact.id}
                                onClick={() => toggleContact(contact.contact_share_id)}
                                className={cn(
                                  'w-full flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-lg transition-all text-left min-h-[48px]',
                                  isSelected
                                    ? 'bg-blue-50 border border-blue-200'
                                    : 'bg-white hover:bg-gray-50 border border-transparent active:bg-gray-100'
                                )}
                              >
                                {/* Avatar */}
                                {contact.contact_profile_picture && !failedImages.has(contact.id) ? (
                                  <img
                                    src={contact.contact_profile_picture}
                                    alt={contact.contact_name}
                                    className={cn(
                                      'w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-cover shrink-0',
                                      isSelected && 'ring-2 ring-blue-500 ring-offset-1'
                                    )}
                                    onError={() => {
                                      setFailedImages(prev => new Set(prev).add(contact.id));
                                    }}
                                  />
                                ) : (
                                  <div
                                    className={cn(
                                      'w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-xs sm:text-sm font-medium shrink-0',
                                      isSelected
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 text-gray-600'
                                    )}
                                  >
                                    {contact.contact_name.charAt(0).toUpperCase()}
                                  </div>
                                )}

                                {/* Name */}
                                <div className="flex-1 min-w-0">
                                  <p className={cn(
                                    'font-medium truncate text-xs sm:text-sm',
                                    isSelected ? 'text-blue-700' : 'text-gray-900'
                                  )}>
                                    {contact.contact_name}
                                  </p>
                                  <p className="text-[10px] sm:text-xs text-gray-500 truncate">
                                    {contact.contact_share_id}
                                  </p>
                                </div>

                                {/* Checkbox */}
                                <div
                                  className={cn(
                                    'w-5 h-5 sm:w-5 sm:h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                                    isSelected
                                      ? 'bg-blue-500 border-blue-500'
                                      : 'border-gray-300 bg-white'
                                  )}
                                >
                                  {isSelected && <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}

              {/* Permissions section */}
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <label className="block text-xs sm:text-sm font-medium text-gray-700">
                  Permissions
                </label>

                {/* Role selection */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('reader')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-sm font-medium',
                      role === 'reader'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    )}
                  >
                    <Eye className="h-4 w-4" />
                    <span>Lecteur</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => maxRole === 'editor' && setRole('editor')}
                    disabled={maxRole === 'reader'}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-sm font-medium',
                      role === 'editor'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                      maxRole === 'reader' && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Pencil className="h-4 w-4" />
                    <span>Éditeur</span>
                  </button>
                </div>

                {/* Role description */}
                <p className="text-xs text-gray-500">
                  {maxRole === 'reader'
                    ? 'Vous êtes lecteur : vous ne pouvez partager qu\'en mode lecteur'
                    : role === 'reader'
                      ? 'Peut consulter et exporter la synthèse'
                      : 'Peut modifier la synthèse et re-partager'
                  }
                </p>

                {/* Include transcript toggle */}
                {hasTranscript && (
                  <button
                    type="button"
                    onClick={() => setIncludeTranscript(!includeTranscript)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 transition-all',
                      includeTranscript
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                        includeTranscript
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-300 bg-white'
                      )}
                    >
                      {includeTranscript && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <FileText className={cn('h-4 w-4', includeTranscript ? 'text-blue-600' : 'text-gray-400')} />
                    <div className="flex-1 text-left">
                      <span className={cn('text-sm font-medium', includeTranscript ? 'text-blue-700' : 'text-gray-700')}>
                        Inclure la transcription
                      </span>
                      <p className="text-xs text-gray-500">
                        Donne accès au texte complet de l'échange
                      </p>
                    </div>
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Fixed footer with warning and action buttons */}
        <div className="flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-3 border-t border-gray-100 bg-white rounded-b-xl">
          {/* Blocking message if no summary */}
          {cannotShareSummary && (
            <div className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-red-800">
                  Impossible de partager
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  Générez la synthèse avant de partager en mode Lecteur, ou passez en mode Éditeur pour permettre au destinataire de la générer.
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSharing}
              className="flex-1 h-11 text-sm rounded-lg"
            >
              Annuler
            </Button>
            <Button
              onClick={handleShare}
              disabled={totalSelected === 0 || isSharing || cannotShareSummary}
              className="flex-1 h-11 text-sm text-white hover:opacity-90 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: GILBERT_BLUE }}
            >
              {isSharing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Partage...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Partager</span>
                  <span className="sm:hidden">OK</span>
                  {totalSelected > 0 && <span className="ml-1">({totalSelected})</span>}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ShareDialog;
