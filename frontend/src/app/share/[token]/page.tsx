import type { Metadata } from "next";
import { PublicBoardClient } from "./PublicBoardClient";

export const metadata: Metadata = {
  title: "План работ · NevOcean",
  robots: { index: false, follow: false },
};

export default function PublicBoardPage({ params }: { params: { token: string } }) {
  return <PublicBoardClient token={params.token} />;
}
