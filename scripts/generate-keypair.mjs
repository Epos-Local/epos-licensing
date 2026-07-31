import {
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
} from "node:crypto";

/**
 * Mints a production RSA-2048 signing keypair.
 *
 * Prints, and does not write, the private key: it belongs in the Vercel and
 * Supabase environment only. Nothing in this repository should ever hold it,
 * and no code path logs it.
 *
 *   node scripts/generate-keypair.mjs
 *
 * Running this again after launch invalidates every license already issued,
 * because the public key compiled into the client will no longer match. It is a
 * one-time action unless the key is believed compromised.
 */

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001,
  // PKCS#1 DER is the RSAPublicKey structure .NET's RSA.ImportRSAPublicKey
  // consumes. SubjectPublicKeyInfo, the other common encoding, would need
  // ImportSubjectPublicKeyInfo instead and would fail against the client as
  // written.
  publicKeyEncoding: { type: "pkcs1", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const probe = Buffer.from("epos-licensing keypair self-test", "utf8");
const signature = createSign("SHA256")
  .update(probe)
  .sign({ key: privateKey, padding: 1 });
const verified = createVerify("SHA256")
  .update(probe)
  .verify(
    { key: createPublicKey({ key: publicKey, format: "der", type: "pkcs1" }), padding: 1 },
    signature,
  );

if (!verified) throw new Error("generated keypair failed its own round-trip");

const oneLinePem = privateKey.trim().replace(/\r?\n/g, "\\n");

console.log("Self-test: the two halves verify against each other.\n");
console.log("1. Put this in the environment as LICENSE_SIGNING_PRIVATE_KEY.");
console.log("   Secret. Never commit it, never log it.\n");
console.log(oneLinePem);
console.log(
  "\n2. Paste this into Pos.Core/Services/LicenseBlobSigning.cs as the value of",
);
console.log("   DevPublicKeyBase64, replacing the dev key, and rebuild the client.\n");
console.log(publicKey.toString("base64"));
