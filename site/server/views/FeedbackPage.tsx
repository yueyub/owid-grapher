import React = require("react")
import { Head } from "./Head"
import { ClientSettings } from "clientSettings"
import { SiteHeader } from "./SiteHeader"
import { SiteFooter } from "./SiteFooter"
import { FeedbackForm } from "site/client/Feedback"

export class FeedbackPage extends React.Component<{
    clientSettings: ClientSettings
}> {
    render() {
        return (
            <html>
                <Head
                    clientSettings={this.props.clientSettings}
                    canonicalUrl={`${this.props.clientSettings.BAKED_BASE_URL}/feedback`}
                    pageTitle="Feedback"
                    pageDesc="Do you have feedback or suggestions for improving Our World in Data? Let us know!"
                />
                <body className="FeedbackPage">
                    <SiteHeader />
                    <main>
                        <FeedbackForm />
                    </main>
                    <SiteFooter
                        hideDonate={true}
                        clientSettings={this.props.clientSettings}
                    />
                </body>
                <script>{`window.runFeedbackPage()`}</script>
            </html>
        )
    }
}
