import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session";

export default async function Home() {
  redirect((await currentSession()) ? "/dashboard" : "/login");
}
