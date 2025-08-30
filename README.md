# SplitSmart AI: On-the-Spot Bill Splitting User Flow

This document outlines the step-by-step user experience for splitting a restaurant bill in real-time using SplitSmart AI.

Scenario: Sam and 3 friends have just finished dinner. The physical bill arrives at the table. Sam offers to pay with his card and have his friends pay him back.

## Step 1: Initiate a "Split"

* Action: Sam opens the SplitSmart AI app and taps a prominent "Split a Bill" button on the home screen.

* Behind the Scenes: This action creates a new, temporary "session" in the database.

## Step 2: Invite Friends to the Session

* Action: The app immediately generates a unique QR code and a shareable link. Sam's friends can either scan the QR code on his phone or he can text them the link.

* Result: As each friend joins, their icon/name appears in the app's session screen. No account is needed for friends to join a one-time split, which reduces friction.

## Step 3: Digitize the Receipt with AI

This is the core AI interaction where Honcho's memory becomes crucial.

* Action: Sam taps "Scan Receipt" and takes a picture of the bill.

* Behind the Scenes:

    1. The image is sent to an OCR (Optical Character Recognition) service to extract the raw text.

    2. The extracted text is then sent to a large language model (LLM). The prompt instructs the model to identify and list each line item with its price.

    3. 🧠 Honcho's Role: The LLM's structured output (e.g., [{item: "Burger", price: 18.00}, {item: "Fries", price: 6.00}]) is stored in Honcho's memory for this specific session. Honcho now "remembers" the entire bill.

## Step 4: Claim Items in Real-Time

* Action: The app displays the digitized list of items. Sam and his friends, all viewing the same session on their phones, simply tap the items they each ordered.

* Natural Language Input (Alternative): A user could also use a chat interface. A friend, Alex, could type, "I had the chicken sandwich and a coke."

    * Honcho's Role: The AI, using Honcho's memory of the receipt, intelligently matches Alex's text to the line items "Chicken Sand." and "Coca-Cola" from the bill and assigns them to him.

* Handling Shared Items: For an item like "Calamari Appetizer," multiple people can tap to claim it. The app automatically knows to split the cost of that item among those who claimed it.

## Step 5: Add Tax & Tip

* Action: The app pre-fills the tax amount from the receipt. It then presents a simple interface for the group to decide on a tip (e.g., 18%, 20%, 25%, or a custom amount). The total is updated.

## Step 6: Settle Up Instantly

* Action: The final screen shows a clear breakdown: "You owe Sam $28.50." Below this, there is a "Pay with Flowglaid" button.

* Behind the Scenes:

    * 💳 Flowglaid's Role: When Alex taps the pay button, it initiates a peer-to-peer payment from his connected payment method to Sam's. The transaction is processed securely by Flowglaid.

* Result: As each person pays, the session screen updates in real-time, showing a "Paid" status next to their name. The entire process, from receiving the bill to settling up, is done before the waiter even comes back.

## Dev Setup: Flowglad Checkout (MVP)

To enable the Pay button and Flowglad Checkout:

* Create a single-payment price in Flowglad for 1 cent (recommended), and set:

```bash
FLOWGLAD_CENTS_PRICE_ID=<your_1_cent_price_id>
```

* Alternatively, set a specific price ID and the API will use quantity=1:

```bash
FLOWGLAD_PRICE_ID=<your_price_id>
```

* Ensure the server key is set (already included in `.env.local` for dev):

```bash
FLOWGLAD_SECRET_KEY=sk_test_...
```

Optional:

```bash
FLOWGLAD_BASE_URL=https://api.flowglad.com
```

The checkout API will create a pending payment in Supabase, create a Flowglad checkout session, and redirect back to `/s/[code]` upon success where the payment is marked as `paid`.