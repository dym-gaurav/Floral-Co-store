import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Copy, Download, Loader2, MessageCircle } from "lucide-react";
import Button from "../common/Button";
import { buildOrderMessage, copyToClipboard } from "../../utils/whatsappOrder";
import { buildOrderImage, downloadBlob, orderSignature } from "../../utils/orderImage";
import { siteConfig } from "../../config/site";

const FILE_NAME = "floral-and-co-order.png";

// Touch phones/tablets (also true when Chrome is set to "Desktop site")
const isMobile = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform)) ||
  window.matchMedia?.("(pointer: coarse)").matches;

export default function OrderForm({ items, subtotal }) {
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "" });
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null); // { url } of the latest prepared picture
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(null); // shown when the picture could not be attached automatically
  const busyRef = useRef(false); // blocks double taps even before React re-renders
  const refs = { name: useRef(null), phone: useRef(null), address: useRef(null) };
  const cacheRef = useRef({ key: null, blob: null }); // last finished picture
  const pendingRef = useRef({ key: null, promise: null }); // picture currently being drawn

  const order = useMemo(() => ({ items, customer, notes, subtotal }), [items, customer, notes, subtotal]);
  const message = useMemo(() => buildOrderMessage(order), [order]);
  const signature = useMemo(() => orderSignature(order), [order]);

  /** Returns a picture that matches the CURRENT order data (reuses a prepared one when it is still current). */
  const getBlob = (o = order, key = signature) => {
    if (cacheRef.current.key === key && cacheRef.current.blob) return Promise.resolve(cacheRef.current.blob);
    if (pendingRef.current.key === key && pendingRef.current.promise) return pendingRef.current.promise;
    const promise = buildOrderImage(o)
      .then((blob) => {
        cacheRef.current = { key, blob };
        return blob;
      })
      .finally(() => {
        if (pendingRef.current.promise === promise) pendingRef.current = { key: null, promise: null };
      });
    pendingRef.current = { key, promise };
    return promise;
  };

  // Prepare the picture in the background while the customer types. Browsers only allow the share sheet
  // shortly after a tap, so having it ready makes "Place Order via WhatsApp" open the share sheet instantly.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const blob = await getBlob();
        if (cancelled) return;
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url: URL.createObjectURL(blob) };
        });
      } catch {
        /* the picture is retried (and reported) when the customer places the order */
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => () => setPreview((old) => (old && URL.revokeObjectURL(old.url), null)), []);

  const set = (key) => (e) => {
    setCustomer((c) => ({ ...c, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: "" }));
  };

  const validate = () => {
    const next = {};
    if (!customer.name.trim()) next.name = "Please add your name so we know who the order is from.";
    const digits = customer.phone.replace(/\D/g, "");
    if (!customer.phone.trim()) next.phone = "Please add your phone number.";
    else if (digits.length < 7 || digits.length > 15) next.phone = "Please enter a valid phone number (7 to 15 digits).";
    if (customer.address.trim().length < 5) next.address = "Please add your full delivery address.";
    setErrors(next);
    const first = ["name", "phone", "address"].find((k) => next[k]);
    if (first) refs[first].current?.focus();
    return !first;
  };

  const handleSavePicture = async () => {
    try {
      downloadBlob(await getBlob(), FILE_NAME);
    } catch {
      toast.error("The picture couldn't be created. Please try again.");
    }
  };

  const handleCopy = async () => {
    if (!validate()) return;
    const ok = await copyToClipboard(message);
    if (ok) toast.success("Message copied. Paste it into your WhatsApp chat.");
    else toast.error("Couldn't copy automatically. Please try again.");
  };

  // Opens the studio's WhatsApp chat with the full message prefilled. Returns false if the browser blocked it.
  const openChat = () => {
    const w = window.open(siteConfig.whatsappLink(message), "_blank", "noopener");
    return Boolean(w);
  };

  // Saves the order picture, then opens OUR WhatsApp chat directly with the message already typed.
  // (WhatsApp links can't attach a picture, so the customer attaches the saved one before sending.)
  const sendToChat = async (blob) => {
    if (blob) {
      downloadBlob(blob, FILE_NAME);
      await new Promise((r) => setTimeout(r, 400)); // let the download start before WhatsApp takes over
    }
    const opened = openChat();
    let copied = false;
    if (blob && !isMobile() && navigator.clipboard?.write && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        copied = true;
      } catch {
        /* clipboard images not allowed here */
      }
    }
    setHelp({
      reason: blob
        ? "WhatsApp is opening with your order message already typed. Your order picture was saved to your device."
        : "We couldn't create the order picture on this device, so WhatsApp opened with your full order message instead.",
      opened,
      copied,
      hasImage: Boolean(blob),
    });
  };

  const handleOrder = async () => {
    if (busyRef.current) return; // already preparing: ignore repeat taps
    if (!items.length) return toast.error("Your cart is empty. Add something first.");
    if (!validate()) return;

    busyRef.current = true;
    setBusy(true);
    setHelp(null);
    try {
      let blob = null;
      try {
        blob = await getBlob();
      } catch {
        blob = null;
      }
      await sendToChat(blob);
    } catch {
      toast.error("Something went wrong preparing your order. Please try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const field = (key) => ({
    ref: refs[key],
    value: customer[key],
    onChange: set(key),
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `order-${key}-error` : undefined,
  });
  const err = (key) =>
    errors[key] ? (
      <p id={`order-${key}-error`} role="alert" className="mt-1.5 text-sm text-gold">{errors[key]}</p>
    ) : null;

  return (
    <section id="checkout" aria-labelledby="checkout-title" className="scroll-mt-24">
      <h2 id="checkout-title" className="text-4xl sm:text-5xl">Send your order on WhatsApp</h2>
      <ol className="mt-5 max-w-2xl list-decimal space-y-1 pl-5 text-mist">
        <li>Add your delivery details below.</li>
        <li>Tap Place Order via WhatsApp. Our chat opens with your order message already typed, and your order picture is saved to your phone.</li>
        <li>Attach the picture with the paperclip (optional), then press send. We reply to confirm availability and final pricing.</li>
      </ol>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <label htmlFor="order-name" className="mb-1.5 block text-sm text-ivory">Your name <span className="text-mist">(required)</span></label>
            <input id="order-name" type="text" autoComplete="name" className="field" {...field("name")} />
            {err("name")}
          </div>
          <div>
            <label htmlFor="order-phone" className="mb-1.5 block text-sm text-ivory">Phone number <span className="text-mist">(required)</span></label>
            <input id="order-phone" type="tel" inputMode="tel" autoComplete="tel" className="field" {...field("phone")} />
            {err("phone")}
          </div>
          <div>
            <label htmlFor="order-address" className="mb-1.5 block text-sm text-ivory">Delivery address <span className="text-mist">(required)</span></label>
            <textarea id="order-address" rows={3} autoComplete="street-address" className="field resize-y" {...field("address")} />
            {err("address")}
          </div>
          <div>
            <label htmlFor="order-notes" className="mb-1.5 block text-sm text-ivory">Notes <span className="text-mist">(optional)</span></label>
            <textarea id="order-notes" rows={3} placeholder="Gift message, deadline, colour preferences…" className="field resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col">
          <p className="mb-1.5 text-sm text-ivory">Your order picture</p>
          <div className="flex min-h-[16rem] items-center justify-center rounded-sm border border-ivory/15 bg-forest/60 p-3">
            {preview ? (
              <img src={preview.url} alt="Preview of your order picture" className="max-h-[26rem] w-auto rounded-sm" />
            ) : (
              <p className="text-sm text-mist">Preparing your picture…</p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={handleOrder} disabled={busy} aria-busy={busy} variant="primary" size="lg">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
              {busy ? "Preparing your order..." : "Place Order via WhatsApp"}
            </Button>
            <Button onClick={handleSavePicture} disabled={busy} variant="outline" size="lg">
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Save picture
            </Button>
            <Button onClick={handleCopy} disabled={busy} variant="ghost" size="lg">
              <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Copy message
            </Button>
          </div>

          {help && (
            <div role="status" className="mt-5 rounded-sm border border-gold/40 bg-gold/10 p-4 text-sm leading-relaxed text-ivory">
              <p>{help.reason}</p>
              <p className="mt-3 font-medium text-gold">
                {help.hasImage
                  ? "Attach your order picture in the chat (paperclip), then press send."
                  : "Your order message is already typed in the chat. Press send to place your order."}
              </p>
              {help.hasImage && (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-mist">
                  <li>
                    {help.copied
                      ? "Your picture is copied: click in the chat and press Ctrl+V (Cmd+V on Mac), or use the saved file."
                      : "Your picture was saved to your device (use Save picture if you can't find it)."}
                  </li>
                  {!help.copied && <li>In WhatsApp tap the paperclip, choose Gallery or Photos, pick the order picture.</li>}
                  <li>Press send. Nothing is confirmed until we reply.</li>
                </ol>
              )}
              {!help.opened && (
                <p className="mt-3 text-mist">Your browser blocked WhatsApp from opening. Tap Open WhatsApp below.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                <Button onClick={openChat} variant="primary" size="sm">Open WhatsApp</Button>
                {help.hasImage && <Button onClick={handleSavePicture} variant="outline" size="sm">Save picture again</Button>}
              </div>
            </div>
          )}

          <p className="mt-5 text-sm leading-relaxed text-mist">
            Nothing is ordered, charged or confirmed until we reply to you on WhatsApp. {siteConfig.orderNote}
          </p>
        </div>
      </div>
    </section>
  );
}
