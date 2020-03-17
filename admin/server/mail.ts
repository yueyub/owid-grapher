import * as nodemailer from "nodemailer"

import { ServerSettings } from "serverSettings"

export function makeSender(serverSettings: ServerSettings) {
    const transporter = nodemailer.createTransport({
        host: serverSettings.EMAIL_HOST,
        port: serverSettings.EMAIL_PORT,
        secure: serverSettings.EMAIL_PORT === 465,
        auth: {
            user: serverSettings.EMAIL_HOST_USER,
            pass: serverSettings.EMAIL_HOST_PASSWORD
        }
    })
    return {
        sendMail: (options: nodemailer.SendMailOptions) => {
            return new Promise((resolve, reject) => {
                transporter.sendMail(options, (err, info) => {
                    if (err) return reject(err)
                    else resolve(info)
                })
            })
        }
    }
}
