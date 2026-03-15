import { Component, OnInit } from '@angular/core';
import { AppNotification } from '../../models/ayurveda.models';
import { AuthService } from '../../services/auth.service';
import { AyurvedaDataService, NotificationFrequency } from '../../services/ayurveda-data.service';
import { SmartCareReminderService } from '../../services/smart-care-reminder.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss']
})
export class NotificationsComponent implements OnInit {
  notifications: AppNotification[] = [];
  frequency: NotificationFrequency = 'balanced';
  savingPreference = false;

  constructor(
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private smartReminder: SmartCareReminderService
  ) {}

  async ngOnInit(): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    this.frequency = this.ayurvedaData.getNotificationPreference(user.id).frequency;
    await this.smartReminder.runForCurrentUser(true);
    this.notifications = this.ayurvedaData.getNotifications(user.id);
  }

  markSeen(id: string): void {
    this.ayurvedaData.markNotificationSeen(id);
    const user = this.auth.getCurrentUser();
    if (!user) return;
    this.notifications = this.ayurvedaData.getNotifications(user.id);
  }

  async updateFrequency(next: NotificationFrequency): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    this.savingPreference = true;
    this.frequency = next;
    this.ayurvedaData.setNotificationPreference(user.id, { frequency: next });
    await this.smartReminder.runForCurrentUser(true);
    this.notifications = this.ayurvedaData.getNotifications(user.id);
    this.savingPreference = false;
  }
}
