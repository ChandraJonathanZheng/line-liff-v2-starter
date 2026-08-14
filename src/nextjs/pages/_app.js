import "../styles/globals.css";
import { useState, useEffect } from "react";
import liff from "@line/liff";

const devLiffStub = {
  getIDToken: () => "dev-mode-token",
  getAccessToken: () => "dev-mode-token",
  isLoggedIn: () => true,
  getProfile: () => Promise.resolve({ displayName: "Dev User", userId: "dev-user" }),
  isApiAvailable: () => false,
  shareTargetPicker: () => Promise.resolve(),
};

function MyApp({ Component, pageProps }) {
  const [liffObject, setLiffObject] = useState(null);
  const [liffError, setLiffError] = useState(null);

  // Execute liff.init() when the app is initialized
  useEffect(() => {
    if (process.env.DEV_MODE === "true") {
      console.log("DEV_MODE: skipping liff.init(), using stub liff object");
      setLiffObject(devLiffStub);
      return;
    }
    console.log("start liff.init()...");
    liff
      .init({ liffId: process.env.LIFF_ID || "I2011020800-EmV3FAty" })
      .then(() => {
        console.log("liff.init() done");
        setLiffObject(liff);
      })
      .catch((error) => {
        console.log(`liff.init() failed: ${error}`);
        if (!process.env.LIFF_ID) {
          console.info(
            "LIFF Starter: Please make sure that you provided `LIFF_ID` as an environmental variable."
          );
        }
        setLiffError(error.toString());
      });
  }, []);

  // Provide `liff` object and `liffError` object
  // to page component as property
  pageProps.liff = liffObject;
  pageProps.liffError = liffError;
  return <Component {...pageProps} />;
}

export default MyApp;
