import { getTranslations } from 'next-intl/server';
import SettingsClient from './SettingsClient';

export async function generateMetadata() {
  const t = await getTranslations({ locale: 'fr', namespace: 'admin.settings' });
  return { title: t('title') };
}

export default function SettingsPage() {
  return <SettingsClient />;
}
// app/admin/settings/page.tsx
/*'use client'

import { useState, useEffect } from 'react'
import { useAdminGET, useAdminPUT } from '@/lib/api/hooks'
import { Settings } from '@/lib/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
//import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { AlertCircle, Save, Key, Clock, Bell, Globe } from 'lucide-react'
//import { useToast } from '@/components/ui/use-toast'

export default function AdminSettingsPage() {
  const { data: settings, loading, error, refetch } = useAdminGET<Settings>('/settings')
  const { execute: updateSettings, loading: updateLoading } = useAdminPUT('/settings')
  const { toast } = useToast()

  // Form state
  const [deleteCode, setDeleteCode] = useState('')
  const [sessionTimeout, setSessionTimeout] = useState(5)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [language, setLanguage] = useState<'fr' | 'ar'>('fr')
  const [enableTelegram, setEnableTelegram] = useState(false)
  const [enableEmail, setEnableEmail] = useState(false)

  // Load settings into form
  useEffect(() => {
    if (settings) {
      setDeleteCode('') // don't prefill for security
      setSessionTimeout(settings.sessionTimeoutMinutes)
      setNotificationEmail(settings.notificationEmail || '')
      setTelegramChatId(settings.telegramChatId || '')
      setLanguage(settings.language)
      setEnableTelegram(!!settings.telegramChatId)
      setEnableEmail(!!settings.notificationEmail)
    }
  }, [settings])

  const handleSave = async () => {
    try {
      const updates: Partial<Settings> = {
        sessionTimeoutMinutes: sessionTimeout,
        language,
      }
      if (deleteCode) {
        updates.deleteVerificationCode = deleteCode
      }
      if (enableEmail && notificationEmail) {
        updates.notificationEmail = notificationEmail
      } else if (!enableEmail) {
        updates.notificationEmail = '' // clear
      }
      if (enableTelegram && telegramChatId) {
        updates.telegramChatId = telegramChatId
      } else if (!enableTelegram) {
        updates.telegramChatId = ''
      }

      await updateSettings(updates)
      toast({
        title: 'Settings saved',
        description: 'Your changes have been updated successfully.',
      })
      setDeleteCode('') // clear after save
      refetch()
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save settings',
        variant: 'destructive',
      })
    }
  }

  if (loading) return <div>Loading settings...</div>
  if (error) return <div className="text-red-500">Error: {error.message}</div>

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-8">Settings</h2>

      <Tabs defaultValue="security" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Manage delete verification code and session timeout.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="deleteCode">New Delete Verification Code</Label>
                <Input
                  id="deleteCode"
                  type="password"
                  value={deleteCode}
                  onChange={(e) => setDeleteCode(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
                <p className="text-sm text-gray-500">
                  This code is required when deleting bookings, events, or products.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Input
                  id="sessionTimeout"
                  type="number"
                  min={1}
                  max={60}
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(parseInt(e.target.value) || 5)}
                />
                <p className="text-sm text-gray-500">
                  Admin dashboard will auto-lock after this period of inactivity.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

    
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure where to receive system alerts and export notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Receive alerts via email
                  </p>
                </div>
                <Switch
                  checked={enableEmail}
                  onCheckedChange={setEnableEmail}
                />
              </div>

              {enableEmail && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="email">Notification Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    placeholder="admin@example.com"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Telegram Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Receive instant alerts via Telegram
                  </p>
                </div>
                <Switch
                  checked={enableTelegram}
                  onCheckedChange={setEnableTelegram}
                />
              </div>

              {enableTelegram && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="telegram">Telegram Chat ID</Label>
                  <Input
                    id="telegram"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="123456789"
                  />
                  <p className="text-xs text-gray-400">
                    Get your chat ID by messaging @userinfobot on Telegram.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Preferences
              </CardTitle>
              <CardDescription>
                Set your default language and other preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="language">Default Language</Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'fr' | 'ar')}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                </select>
                <p className="text-sm text-gray-500">
                  This affects admin interface language.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

     
      <div className="mt-8 flex justify-end">
        <Button onClick={handleSave} disabled={updateLoading} size="lg">
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  )
}*/