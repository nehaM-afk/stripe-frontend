import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { loadStripe, Stripe, StripePaymentRequestButtonElement } from '@stripe/stripe-js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
})
export class AppComponent implements OnInit {
  title = 'stripe-apple';
  private stripe: Stripe | null = null;
  private prButton: StripePaymentRequestButtonElement | null = null;

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    try {
      // Fetch the publishable key from your backend
      const config = await this.http.get<{ publishableKey: string }>('https://stripe-project-hnyq.onrender.com/config').toPromise();
      const publishableKey = config?.publishableKey;
     
      if (!publishableKey) {
        this.addMessage('No publishable key returned from the server. Please check `.env` and try again');
        alert('Please set your Stripe publishable API key in the .env file');
        return;
      }

      // Initialize Stripe
      this.stripe = await loadStripe(publishableKey, { apiVersion: '2020-08-27' });
      if (!this.stripe) {
        console.error('Stripe failed to initialize.');
        return;
      }

      // Create a payment request object
      const paymentRequest = this.stripe.paymentRequest({
        country: 'US',
        currency: 'usd',
        total: {
          label: 'Demo total',
          amount: 1999,
        },
        requestPayerName: true,
        requestPayerEmail: true,
        disableWallets: ['googlePay', 'browserCard'],
      });

      // Create a PaymentRequestButton element
      const elements = this.stripe.elements();
      this.prButton = elements.create('paymentRequestButton', {
        paymentRequest: paymentRequest,
      });

      // Check the availability of the Payment Request API, then mount the PaymentRequestButton
      const canMakePayment = await paymentRequest.canMakePayment();
      const paymentRequestButton = document.getElementById('payment-request-button');
      console.log('canMakePayment result:', canMakePayment);
      
      alert(JSON.stringify(canMakePayment))
      if (canMakePayment && paymentRequestButton) {
        this.prButton.mount('#payment-request-button');
      } else if (paymentRequestButton) {
        paymentRequestButton.style.display = 'none';
        this.addMessage('Apple Pay support not found. Check the pre-requisites above and ensure you are testing in a supported browser.');
      }

      paymentRequest.on('paymentmethod', async (e) => {
        try {
          // Make a call to the server to create a new payment intent
          const response = await this.http.post<{ clientSecret: string, error?: any }>(
            'https://stripe-project-hnyq.onrender.com/create-payment-intent',
            {
              currency: 'usd',
              paymentMethodType: 'card',
            }
          ).toPromise();

          const clientSecret = response?.clientSecret;
          const backendError = response?.error;

          if (backendError || !clientSecret) {
            this.addMessage(backendError?.message || 'No client secret returned from the server');
            e.complete('fail');
            return;
          }

          this.addMessage(`Client secret returned: ${clientSecret}`);

          if (!this.stripe) {
            console.error('Stripe is not initialized.');
            e.complete('fail');
            return;
          }

          let { error, paymentIntent } = await this.stripe.confirmCardPayment(
            clientSecret,
            {
              payment_method: e.paymentMethod.id,
            },
            {
              handleActions: false,
            }
          );

          if (error) {
            this.addMessage(error.message || 'An unknown error occurred');
            e.complete('fail');
            return;
          }

          e.complete('success');

          if (paymentIntent?.status === 'requires_action') {
            ({ error, paymentIntent } = await this.stripe.confirmCardPayment(clientSecret));
            if (error) {
              this.addMessage(error.message || 'An unknown error occurred');
              return;
            }
            this.addMessage(`Payment ${paymentIntent?.status}: ${paymentIntent?.id}`);
          } else {
            this.addMessage(`Payment ${paymentIntent?.status}: ${paymentIntent?.id}`);
          }
        } catch (error) {
          console.error('Error creating payment intent:', error);
          this.addMessage(`Error creating payment intent: ${error}`);
        }
      });
    } catch (error) {
      console.error('Error initializing Stripe:', error);
      this.addMessage(`Error initializing Stripe: ${error}`);
    }
  }

  private addMessage(message: string) {
    const messagesDiv = document.getElementById('messages');
    if (messagesDiv) {
      messagesDiv.innerText = message;
    }
  }
}
