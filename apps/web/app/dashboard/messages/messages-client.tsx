'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { dateTime, shortDate } from '@/lib/format';

interface Conversation {
  id: number;
  public_id: string;
  context_type: string;
  context_id: number;
  title: string;
  status: string;
  last_message_body: string | null;
  last_message_time: string | null;
  last_sender_name: string | null;
  unread_count: number;
  sla_breached: number;
  created_at: string;
}

interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  message_type: 'TEXT' | 'SYSTEM' | 'NOTE' | 'STATUS_UPDATE';
  is_internal: number;
  body: string;
  created_at: string;
}

interface Participant {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  user_system_role: string;
}

const CONTEXT_TABS = [
  { label: 'All', value: '' },
  { label: 'Enquiries', value: 'ENQUIRY' },
  { label: 'Visits', value: 'VISIT' },
  { label: 'Applications', value: 'APPLICATION' },
  { label: 'Tenancies', value: 'TENANCY' },
  { label: 'Maintenance', value: 'MAINTENANCE' },
  { label: 'Disputes', value: 'DISPUTE' },
  { label: 'Support', value: 'SUPPORT' },
];

export function MessagesClient() {
  const searchParams = useSearchParams();
  const initialConvId = searchParams.get('conversationId');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [canSeeInternal, setCanSeeInternal] = useState(false);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [activeTab, setActiveTab] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [messageText, setMessageText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);

  // Escalate modal state
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async () => {
    try {
      setLoadingList(true);
      const params = new URLSearchParams();
      if (activeTab) params.set('contextType', activeTab);
      if (searchQuery) params.set('search', searchQuery);

      const res = await api<{ data: Conversation[] }>(`/conversations?${params.toString()}`);
      setConversations(res.data || []);

      if (initialConvId && !selectedConv) {
        const target = (res.data || []).find((c) => String(c.id) === initialConvId);
        if (target) {
          selectConversation(target);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    try {
      setLoadingMessages(true);
      const [detailRes, msgRes] = await Promise.all([
        api<{
          conversation: Conversation;
          participants: Participant[];
          canSeeInternal: boolean;
        }>(`/conversations/${conv.id}`),
        api<{ data: Message[] }>(`/conversations/${conv.id}/messages`),
      ]);

      setSelectedConv(detailRes.conversation);
      setParticipants(detailRes.participants || []);
      setCanSeeInternal(detailRes.canSeeInternal || false);
      setMessages(msgRes.data || []);

      // Decrement unread count locally
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c)),
      );
    } catch (err) {
      console.error('Failed to load conversation details:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [activeTab, searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConv || sending) return;

    try {
      setSending(true);
      if (isInternalNote && canSeeInternal) {
        await api(`/conversations/${selectedConv.id}/internal-note`, {
          method: 'POST',
          body: JSON.stringify({ body: messageText.trim() }),
        });
      } else {
        await api(`/conversations/${selectedConv.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body: messageText.trim() }),
        });
      }

      setMessageText('');
      setIsInternalNote(false);

      // Refresh messages
      const msgRes = await api<{ data: Message[] }>(
        `/conversations/${selectedConv.id}/messages`,
      );
      setMessages(msgRes.data || []);
      fetchConversations();
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedConv || !escalateReason.trim()) return;
    try {
      await api(`/conversations/${selectedConv.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason: escalateReason.trim() }),
      });
      setShowEscalateModal(false);
      setEscalateReason('');
      selectConversation(selectedConv);
    } catch (err: any) {
      alert(err.message || 'Failed to escalate conversation');
    }
  };

  const handleResolve = async () => {
    if (!selectedConv) return;
    try {
      await api(`/conversations/${selectedConv.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Resolved from messages panel' }),
      });
      selectConversation(selectedConv);
    } catch (err: any) {
      alert(err.message || 'Failed to resolve conversation');
    }
  };

  const handleReopen = async () => {
    if (!selectedConv) return;
    try {
      await api(`/conversations/${selectedConv.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Reopened from messages panel' }),
      });
      selectConversation(selectedConv);
    } catch (err: any) {
      alert(err.message || 'Failed to reopen conversation');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">Open</span>;
      case 'ACTIVE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Active</span>;
      case 'ESCALATED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">Escalated</span>;
      case 'RESOLVED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">Resolved</span>;
      case 'CLOSED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-600">Closed</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Messages & Communications</h1>
          <p className="mt-1 text-sm text-muted">
            Auditable, contextual business messaging across enquiries, visits, applications, tenancies, and disputes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[650px] max-h-[850px]">
        {/* Left Sidebar: Conversations List */}
        <div className="lg:col-span-4 flex flex-col rounded-card border bg-surface overflow-hidden shadow-card">
          <div className="p-4 border-b space-y-3">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-line p-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-seal"
            />
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
              {CONTEXT_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
                    activeTab === tab.value
                      ? 'bg-seal-deep text-white'
                      : 'bg-muted/10 text-muted hover:bg-muted/20'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-line/60">
            {loadingList ? (
              <div className="p-8 text-center text-sm text-muted">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">No conversations found.</div>
            ) : (
              conversations.map((c) => {
                const isSelected = selectedConv?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => selectConversation(c)}
                    className={`p-4 cursor-pointer transition-colors hover:bg-muted/5 ${
                      isSelected ? 'bg-seal-soft/50 border-l-4 border-seal-deep' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] font-semibold bg-muted/15 px-1.5 py-0.5 rounded text-seal-deep">
                          {c.context_type}
                        </span>
                        {c.sla_breached === 1 && (
                          <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                            SLA
                          </span>
                        )}
                        <span className="font-semibold text-sm line-clamp-1">
                          {c.title || c.public_id}
                        </span>
                      </div>
                      {c.unread_count > 0 && (
                        <span className="bg-seal text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                          {c.unread_count}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-muted line-clamp-1">
                      {c.last_message_body ? (
                        <>
                          <span className="font-medium text-foreground">{c.last_sender_name}: </span>
                          {c.last_message_body}
                        </>
                      ) : (
                        'No messages yet.'
                      )}
                    </p>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                      <span>{c.last_message_time ? dateTime(c.last_message_time) : shortDate(c.created_at)}</span>
                      {getStatusBadge(c.status)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Main Area: Active Thread */}
        <div className="lg:col-span-8 flex flex-col rounded-card border bg-surface overflow-hidden shadow-card">
          {selectedConv ? (
            <>
              {/* Header */}
              <div className="p-4 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-seal-deep">
                      {selectedConv.public_id}
                    </span>
                    {getStatusBadge(selectedConv.status)}
                    <span className="text-xs font-mono bg-muted/20 px-2 py-0.5 rounded">
                      Context: {selectedConv.context_type} #{selectedConv.context_id}
                    </span>
                  </div>
                  <h2 className="font-display text-lg font-semibold mt-1">
                    {selectedConv.title || `Conversation #${selectedConv.id}`}
                  </h2>
                  <div className="text-xs text-muted flex gap-2 mt-1">
                    <span>
                      Participants: {participants.map((p) => p.full_name).join(', ') || 'None'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedConv.status !== 'ESCALATED' && selectedConv.status !== 'CLOSED' && (
                    <button
                      type="button"
                      onClick={() => setShowEscalateModal(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-paper"
                    >
                      Escalate
                    </button>
                  )}
                  {selectedConv.status === 'RESOLVED' ? (
                    <button
                      type="button"
                      onClick={handleReopen}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-paper"
                    >
                      Reopen
                    </button>
                  ) : selectedConv.status !== 'CLOSED' ? (
                    <button
                      type="button"
                      onClick={handleResolve}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-paper"
                    >
                      Mark Resolved
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Message Thread */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-paper/50 min-h-[350px]">
                {loadingMessages ? (
                  <div className="p-8 text-center text-sm text-muted">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    This conversation has no messages yet. Send a message below to start communicating.
                  </div>
                ) : (
                  messages.map((m) => {
                    if (m.message_type === 'SYSTEM') {
                      return (
                        <div key={m.id} className="flex justify-center my-3">
                          <div className="bg-paper border border-line text-[11px] text-muted px-3 py-1.5 rounded-full text-center max-w-lg shadow-sm">
                            <span className="font-semibold text-seal-deep">System: </span>
                            {m.body}
                            <span className="ml-2 text-[10px] text-muted/80">{dateTime(m.created_at)}</span>
                          </div>
                        </div>
                      );
                    }

                    if (m.is_internal === 1) {
                      return (
                        <div key={m.id} className="flex justify-center my-2">
                          <div className="w-full bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 shadow-sm">
                            <div className="flex justify-between items-center font-semibold mb-1">
                              <span className="flex items-center gap-1.5">
                                <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                  Internal Note
                                </span>
                                <span>{m.sender_name} ({m.sender_role})</span>
                              </span>
                              <span className="text-[11px] text-amber-700">{dateTime(m.created_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap">{m.body}</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id} className="flex flex-col space-y-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-xs text-foreground">{m.sender_name}</span>
                          <span className="text-[10px] text-muted">{m.sender_role}</span>
                          <span className="text-[10px] text-muted ml-auto">{dateTime(m.created_at)}</span>
                        </div>
                        <div className="bg-surface border border-line p-3 rounded-lg text-sm whitespace-pre-wrap max-w-2xl shadow-subtle">
                          {m.body}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              {selectedConv.status === 'CLOSED' ? (
                <div className="p-4 border-t bg-muted/10 text-center text-xs text-muted">
                  This conversation is CLOSED. Reopen it to send new messages.
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="p-4 border-t bg-surface space-y-3">
                  {canSeeInternal && (
                    <div className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        id="internalToggle"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                        className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <label htmlFor="internalToggle" className="font-medium text-amber-800 cursor-pointer">
                        Post as Internal Management Note (Invisible to Customer & Provider)
                      </label>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      placeholder={
                        isInternalNote
                          ? 'Write internal operational note...'
                          : 'Write your message...'
                      }
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className={`flex-1 rounded-md border p-2 text-sm focus:outline-none focus:ring-2 ${
                        isInternalNote
                          ? 'border-amber-400 bg-amber-50/50 focus:ring-amber-500'
                          : 'border-line focus:ring-seal'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={!messageText.trim() || sending}
                      className={`px-4 py-2 text-xs font-semibold rounded-md text-white transition-colors disabled:opacity-50 ${
                        isInternalNote ? 'bg-amber-600 hover:bg-amber-700' : 'bg-seal hover:bg-seal-deep'
                      }`}
                    >
                      {sending ? 'Sending...' : isInternalNote ? 'Post Note' : 'Send'}
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
              <div className="w-12 h-12 rounded-full bg-paper border border-line flex items-center justify-center mb-3">
                💬
              </div>
              <h3 className="font-semibold text-base text-foreground">Select a conversation</h3>
              <p className="text-xs text-muted max-w-sm mt-1">
                Choose an inquiry, visit, application, tenancy, or support thread from the list to view the message history.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Escalate Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-surface rounded-card border border-line p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-semibold">Escalate Conversation to Management</h3>
            <p className="text-xs text-muted">
              Escalating flags this conversation for immediate supervisor intervention and alerts Odibrick Operations.
            </p>
            <div>
              <label className="block text-xs font-medium mb-1">Reason for escalation</label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-line p-2 text-sm focus:outline-none focus:ring-2 focus:ring-seal"
                placeholder="Describe why management assistance is required..."
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-line bg-white hover:bg-paper"
                onClick={() => setShowEscalateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-alert text-white hover:opacity-90 disabled:opacity-50"
                onClick={handleEscalate}
                disabled={!escalateReason.trim()}
              >
                Confirm Escalation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
