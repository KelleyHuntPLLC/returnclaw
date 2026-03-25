"use client";

import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const emailConnections = [
  {
    id: "1",
    provider: "Gmail",
    email: "aisha@kelleyhunt.law",
    connected: true,
    lastSynced: "5 minutes ago",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
      </svg>
    ),
  },
  {
    id: "2",
    provider: "Outlook",
    email: "",
    connected: false,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#0078D4" d="M24 7.387v10.478c0 .23-.08.424-.238.576a.806.806 0 0 1-.588.236h-8.498v-8.11l2.022 1.478.118.074a.394.394 0 0 0 .2.052.394.394 0 0 0 .2-.052l.118-.074 6.266-4.582c.098-.072.2-.108.302-.108.14 0 .24.06.302.18.036.075.052.15.052.232v-.38Zm0-.846L14.874 12.2l-.198.108a.944.944 0 0 1-.352.088.946.946 0 0 1-.35-.088l-.2-.108L7.5 7.387v-.048c0-.225.08-.414.238-.566a.806.806 0 0 1 .588-.236h14.85c.225 0 .414.08.566.236a.769.769 0 0 1 .236.566v.048l.022.154ZM7.5 7.387V18.54H1.05c-.3 0-.555-.105-.766-.315S0 17.69 0 17.39V6.61c0-.3.095-.555.284-.766.19-.21.466-.316.766-.316h5.4l1.05.774v1.085Z" />
      </svg>
    ),
  },
];

const carriers = [
  { name: "UPS", value: "ups" },
  { name: "FedEx", value: "fedex" },
  { name: "USPS", value: "usps" },
  { name: "DHL", value: "dhl" },
];

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your account, connections, and preferences.
        </p>
      </div>

      {/* Profile */}
      <Card variant="glass">
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account information</CardDescription>
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-medium text-zinc-400">
              AH
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Aisha Hunt</p>
              <p className="text-xs text-zinc-500">aisha@kelleyhunt.law</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full name" defaultValue="Aisha Hunt" />
            <Input label="Email" defaultValue="aisha@kelleyhunt.law" type="email" />
          </div>
          <Button variant="primary" size="sm">
            Save Changes
          </Button>
        </div>
      </Card>

      {/* Email Connections */}
      <Card variant="glass">
        <CardTitle>Email Connections</CardTitle>
        <CardDescription>
          Connect your email to auto-detect orders and track returns
        </CardDescription>
        <div className="mt-6 space-y-3">
          {emailConnections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50"
            >
              <div className="flex items-center gap-3">
                {conn.icon}
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {conn.provider}
                  </p>
                  {conn.email && (
                    <p className="text-xs text-zinc-500">{conn.email}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {conn.connected ? (
                  <>
                    <span className="text-xs text-zinc-600">
                      Synced {conn.lastSynced}
                    </span>
                    <Badge variant="success">Connected</Badge>
                    <Button variant="ghost" size="sm">
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" size="sm">
                    Connect
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Carrier Preferences */}
      <Card variant="glass">
        <CardTitle>Carrier Preferences</CardTitle>
        <CardDescription>
          Set your preferred shipping carrier for return labels
        </CardDescription>
        <div className="mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {carriers.map((carrier) => (
              <button
                key={carrier.value}
                className={`p-4 rounded-xl border text-center transition-all ${
                  carrier.value === "ups"
                    ? "bg-brand-500/10 border-brand-500/30 text-brand-400"
                    : "bg-zinc-900/50 border-zinc-800/50 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <p className="text-sm font-medium">{carrier.name}</p>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Pickup Address */}
      <Card variant="glass">
        <CardTitle>Default Pickup Address</CardTitle>
        <CardDescription>
          Address used for scheduling carrier pickups
        </CardDescription>
        <div className="mt-6 space-y-4">
          <Input label="Street address" defaultValue="1234 Commerce St" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Input label="City" defaultValue="Denver" />
            <Input label="State" defaultValue="CO" />
            <Input label="ZIP code" defaultValue="80202" />
          </div>
          <Button variant="primary" size="sm">
            Update Address
          </Button>
        </div>
      </Card>

      {/* Notifications */}
      <Card variant="glass">
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Choose how you want to be notified about return updates
        </CardDescription>
        <div className="mt-6 space-y-4">
          {[
            { label: "Email notifications", description: "Get email updates for return status changes", defaultChecked: true },
            { label: "Push notifications", description: "Receive browser push notifications", defaultChecked: true },
            { label: "SMS notifications", description: "Get text messages for urgent updates", defaultChecked: false },
          ].map((pref) => (
            <div key={pref.label} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-zinc-200">{pref.label}</p>
                <p className="text-xs text-zinc-500">{pref.description}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={pref.defaultChecked}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-zinc-800 rounded-full peer peer-checked:bg-brand-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
              </label>
            </div>
          ))}
        </div>
      </Card>

      {/* API Key */}
      <Card variant="glass">
        <CardTitle>API Key</CardTitle>
        <CardDescription>
          Use this key to authenticate CLI and API requests
        </CardDescription>
        <div className="mt-6">
          <div className="flex items-center gap-3">
            <code className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-400 font-mono truncate">
              rc_live_••••••••••••••••••••••••
            </code>
            <Button variant="secondary" size="sm">
              Copy
            </Button>
            <Button variant="ghost" size="sm">
              Regenerate
            </Button>
          </div>
        </div>
      </Card>

      {/* Danger zone */}
      <Card variant="glass" className="border-red-500/20">
        <CardTitle className="text-red-400">Danger Zone</CardTitle>
        <CardDescription>Irreversible actions</CardDescription>
        <div className="mt-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-300">Delete account</p>
            <p className="text-xs text-zinc-600">
              Permanently delete your account and all data
            </p>
          </div>
          <Button variant="danger" size="sm">
            Delete Account
          </Button>
        </div>
      </Card>
    </div>
  );
}
