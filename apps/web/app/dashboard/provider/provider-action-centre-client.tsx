'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardHeader, StatTile } from '@/components/ui';
import { inr, shortDate } from '@/lib/format';

export function ProviderActionCentreClient({
  actionCentre,
  performance,
  demandInsights,
}: {
  actionCentre: any;
  performance: any[];
  demandInsights: any;
}) {
  const [activeTab, setActiveTab] = useState<'ACTIONS' | 'PERFORMANCE' | 'DEMAND'>('ACTIONS');

  const summary = actionCentre?.summary || {
    totalListings: 0,
    activeListings: 0,
    pendingEnquiries: 0,
    unansweredLeads: 0,
    upcomingVisits: 0,
    pendingApplications: 0,
    expiringListings: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Provider Action Centre & Intelligence</h1>
          <p className="text-sm text-muted">
            Prioritize customer leads, manage pending applications, track funnel conversion, and analyze market demand.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/properties/new">
            <Button variant="primary">+ List New Property</Button>
          </Link>
        </div>
      </div>

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatTile label="Active Listings" value={summary.activeListings} />
        <StatTile label="Unanswered Leads" value={summary.unansweredLeads} />
        <StatTile label="Pending Enquiries" value={summary.pendingEnquiries} />
        <StatTile label="Upcoming Visits" value={summary.upcomingVisits} />
        <StatTile label="Pending Apps" value={summary.pendingApplications} />
        <StatTile label="Expiring / Aged" value={summary.expiringListings} />
      </div>

      {/* Workspace Tabs */}
      <div className="flex border-b border-line gap-6">
        <button
          onClick={() => setActiveTab('ACTIONS')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'ACTIONS'
              ? 'border-seal text-seal'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Priority Actions Queue ({summary.unansweredLeads + summary.pendingEnquiries + summary.upcomingVisits + summary.pendingApplications})
        </button>
        <button
          onClick={() => setActiveTab('PERFORMANCE')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'PERFORMANCE'
              ? 'border-seal text-seal'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Listing Performance & Funnels ({performance.length})
        </button>
        <button
          onClick={() => setActiveTab('DEMAND')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'DEMAND'
              ? 'border-seal text-seal'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Market Demand Insights (Aggregate)
        </button>
      </div>

      {/* TAB 1: PRIORITY ACTIONS QUEUE */}
      {activeTab === 'ACTIONS' && (
        <div className="space-y-6">
          {/* Pending Enquiries & Leads */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-bold text-ink">New Customer Enquiries</h3>
                <Badge tone={actionCentre?.pendingEnquiries?.length > 0 ? 'ochre' : 'neutral'}>
                  {actionCentre?.pendingEnquiries?.length || 0} Pending
                </Badge>
              </div>
              {actionCentre?.pendingEnquiries?.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">No pending enquiries. You are all caught up!</p>
              ) : (
                <div className="space-y-3">
                  {actionCentre?.pendingEnquiries?.map((enq: any) => (
                    <div key={enq.id} className="p-3 bg-slate-50 border border-line rounded-card space-y-1 text-xs">
                      <div className="flex items-center justify-between font-semibold text-ink">
                        <span>{enq.user_name} • {enq.user_phone || enq.user_email}</span>
                        <span className="text-muted">{shortDate(enq.created_at)}</span>
                      </div>
                      <div className="text-muted font-medium">Property: {enq.property_title}</div>
                      <p className="text-slate-700 italic">"{enq.message}"</p>
                      <div className="pt-2 flex gap-2">
                        <Link href={`/dashboard/messages`}>
                          <Button variant="secondary" size="sm" className="text-xs">
                            Reply in Messages
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-bold text-ink">Unanswered Leads</h3>
                <Badge tone={actionCentre?.unansweredLeads?.length > 0 ? 'ochre' : 'neutral'}>
                  {actionCentre?.unansweredLeads?.length || 0} Leads
                </Badge>
              </div>
              {actionCentre?.unansweredLeads?.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">No unanswered leads currently.</p>
              ) : (
                <div className="space-y-3">
                  {actionCentre?.unansweredLeads?.map((lead: any) => (
                    <div key={lead.id} className="p-3 bg-slate-50 border border-line rounded-card space-y-1 text-xs">
                      <div className="flex items-center justify-between font-semibold text-ink">
                        <span>{lead.name} • {lead.phone}</span>
                        <Badge tone="neutral">{lead.status}</Badge>
                      </div>
                      <div className="text-muted">Interest: {lead.property_title || 'General Property Inquiry'}</div>
                      <div className="text-[11px] text-muted">Source: {lead.source} • {shortDate(lead.created_at)}</div>
                      <div className="pt-2 flex gap-2">
                        <Link href={`/dashboard/leads`}>
                          <Button variant="secondary" size="sm" className="text-xs">
                            Manage Lead
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Upcoming Visits & Applications */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-bold text-ink">Upcoming Property Visits</h3>
                <Badge tone="seal">{actionCentre?.upcomingVisits?.length || 0} Scheduled</Badge>
              </div>
              {actionCentre?.upcomingVisits?.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">No scheduled visits upcoming.</p>
              ) : (
                <div className="space-y-3">
                  {actionCentre?.upcomingVisits?.map((visit: any) => (
                    <div key={visit.id} className="p-3 bg-slate-50 border border-line rounded-card space-y-1 text-xs">
                      <div className="flex items-center justify-between font-semibold text-ink">
                        <span>Visitor: {visit.visitor_name} ({visit.visitor_phone})</span>
                        <Badge tone="seal">{visit.status}</Badge>
                      </div>
                      <div className="text-ink font-medium">{visit.property_title}</div>
                      <div className="text-seal font-semibold">
                        Scheduled on {shortDate(visit.scheduled_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-bold text-ink">Pending Rental Applications</h3>
                <Badge tone={actionCentre?.pendingApplications?.length > 0 ? 'alert' : 'neutral'}>
                  {actionCentre?.pendingApplications?.length || 0} In Review
                </Badge>
              </div>
              {actionCentre?.pendingApplications?.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">No pending rental applications.</p>
              ) : (
                <div className="space-y-3">
                  {actionCentre?.pendingApplications?.map((app: any) => (
                    <div key={app.id} className="p-3 bg-slate-50 border border-line rounded-card space-y-1 text-xs">
                      <div className="flex items-center justify-between font-semibold text-ink">
                        <span>Applicant: {app.applicant_name}</span>
                        <Badge tone="ochre">{app.status}</Badge>
                      </div>
                      <div className="text-muted">{app.property_title}</div>
                      <div className="text-ink font-semibold">
                        Monthly Income: {app.monthly_income ? inr(app.monthly_income) : 'N/A'}
                      </div>
                      <div className="pt-2 flex gap-2">
                        <Link href={`/dashboard/applications`}>
                          <Button variant="primary" size="sm" className="text-xs">
                            Review & Decide
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: LISTING PERFORMANCE & FUNNELS */}
      {activeTab === 'PERFORMANCE' && (
        <div className="space-y-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-line text-ink font-bold">
                  <th className="p-3.5">Property Listing</th>
                  <th className="p-3.5">Rent</th>
                  <th className="p-3.5 text-center">Views</th>
                  <th className="p-3.5 text-center">Saves</th>
                  <th className="p-3.5 text-center">Enquiries</th>
                  <th className="p-3.5 text-center">Leads</th>
                  <th className="p-3.5 text-center">Visits</th>
                  <th className="p-3.5 text-center">Applications</th>
                  <th className="p-3.5 text-center">Conversion</th>
                  <th className="p-3.5 text-right">Days on Market</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {performance.map((item) => (
                  <tr key={item.propertyId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <div className="font-bold text-ink">{item.title}</div>
                      <div className="text-[11px] text-muted">{item.locality}, {item.city}</div>
                    </td>
                    <td className="p-3.5 font-bold text-ink">{inr(item.rentAmount)}</td>
                    <td className="p-3.5 text-center font-semibold text-slate-700">{item.viewsCount}</td>
                    <td className="p-3.5 text-center font-semibold text-seal">{item.savesCount}</td>
                    <td className="p-3.5 text-center font-semibold text-ochre">{item.enquiriesCount}</td>
                    <td className="p-3.5 text-center font-semibold text-sky-700">{item.leadsCount}</td>
                    <td className="p-3.5 text-center font-semibold text-indigo-700">{item.visitsCount}</td>
                    <td className="p-3.5 text-center font-bold text-seal">{item.applicationsCount}</td>
                    <td className="p-3.5 text-center">
                      <Badge tone={item.viewToEnquiryRate > 5 ? 'seal' : 'neutral'}>
                        {item.viewToEnquiryRate}% View $\rightarrow$ Enq
                      </Badge>
                    </td>
                    <td className="p-3.5 text-right font-medium text-muted">{item.daysOnMarket}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* TAB 3: AGGREGATE DEMAND INSIGHTS */}
      {activeTab === 'DEMAND' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-ink text-sm">Top In-Demand Localities</h3>
            <div className="space-y-2">
              {demandInsights?.topLocalities?.map((loc: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-line/50">
                  <span className="font-medium text-ink">{loc.locality}, {loc.city}</span>
                  <span className="font-bold text-seal">{loc.count} seekers</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-ink text-sm">BHK Configuration Demand</h3>
            <div className="space-y-2">
              {demandInsights?.popularBhk?.map((bhk: any, idx: number) => (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>{bhk.bhk} BHK</span>
                    <span>{bhk.sharePct}% share</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-pill overflow-hidden">
                    <div className="bg-seal h-full" style={{ width: `${bhk.sharePct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-ink text-sm">Target Budget Ranges</h3>
            <div className="space-y-2">
              {demandInsights?.budgetDistribution?.map((b: any, idx: number) => (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>{b.range}</span>
                    <span>{b.sharePct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-pill overflow-hidden">
                    <div className="bg-seal h-full" style={{ width: `${b.sharePct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
