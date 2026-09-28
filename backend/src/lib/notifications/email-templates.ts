// backend/src/lib/notifications/email-templates.ts

export const emailTemplates = {
    'welcome': (data: any) => ({
      html: `
        <h1>Welcome to Myshow.tn!</h1>
        <p>Hi ${data.name || 'there'},</p>
        <p>Thank you for joining Myshow.tn. We're excited to have you!</p>
        <p>Start exploring our events and activities for your children.</p>
        <a href="${process.env.FRONTEND_URL}" style="background: #C184FB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Explore Events</a>
      `,
      text: `Welcome to Myshow.tn! Hi ${data.name || 'there'}, Thank you for joining Myshow.tn. We're excited to have you! Start exploring our events and activities for your children. ${process.env.FRONTEND_URL}`
    }),
    'email-change': (data: any) => ({
  html: `
    <h1>Confirm Your Email Address</h1>
    <p>${data.message || 'Please confirm this email address for your account.'}</p>
    <h2 style="font-size: 32px; letter-spacing: 8px; background: #f0f0f0; padding: 16px; text-align: center;">${data.code}</h2>
    <p>This code expires in 5 minutes.</p>
    <p>If you didn't request this change, secure your account immediately.</p>
  `,
  text: `Confirm your email address: ${data.code}. ${data.message || ''} Expires in 5 minutes.`,
}),
    'booking-confirmation': (data: any) => ({
      html: `
        <h1>Booking Confirmed!</h1>
        <p>Dear ${data.customerName || 'Customer'},</p>
        <p>Your booking for <strong>${data.eventTitle}</strong> is confirmed.</p>
        <ul>
          <li>Date: ${new Date(data.eventDate).toLocaleDateString()}</li>
          <li>Children: ${data.childrenCount}</li>
          <li>Total: ${data.totalPrice} TND</li>
        </ul>
        <p>We look forward to seeing you!</p>
      `,
      text: `Booking Confirmed! Dear ${data.customerName || 'Customer'}, Your booking for ${data.eventTitle} is confirmed. Date: ${new Date(data.eventDate).toLocaleDateString()}, Children: ${data.childrenCount}, Total: ${data.totalPrice} TND`
    }),
    
    '2fa-code': (data: any) => ({
      html: `
        <h1>Your 2FA Code</h1>
        <p>Your verification code is:</p>
        <h2 style="font-size: 32px; letter-spacing: 8px; background: #f0f0f0; padding: 16px; text-align: center;">${data.code}</h2>
        <p>This code expires in 5 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      text: `Your 2FA Code: ${data.code}. This code expires in 5 minutes.`
    }),
    
    'export-ready': (data: any) => ({
      html: `
        <h1>Your Export is Ready</h1>
        <p>Your data export has been generated.</p>
        <p>Download link: <a href="${data.downloadUrl}">${data.downloadUrl}</a></p>
        <p>This link expires in 1 hour.</p>
        <p>The file is encrypted. Use your export password to decrypt.</p>
      `,
      text: `Your Export is Ready. Download link: ${data.downloadUrl} (expires in 1 hour)`
    }),
    
    'password-reset': (data: any) => ({
  html: `
    <h1>Password Reset Code</h1>
    <p>Your password reset code is:</p>
    <h2 style="font-size: 32px; letter-spacing: 8px; background: #f0f0f0; padding: 16px; text-align: center;">${data.code}</h2>
    <p>This code expires in 5 minutes.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `,
  text: `Your password reset code: ${data.code}. Expires in 5 minutes.`
}),
  }