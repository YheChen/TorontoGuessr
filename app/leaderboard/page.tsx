import Header from "@/components/Header";

export default function Leaderboard() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground dark:bg-gray-900 light:bg-gray-100">
      <Header />
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 dark:text-white light:text-[#00205B]">
          Leaderboard
        </h1>
        <div className="bg-white dark:bg-gray-800 light:bg-[#00205B] light:text-white light:border-[#001233] light:border-2 rounded-lg shadow p-6">
          {/* <p className="text-center text-gray-500 dark:text-gray-400 light:text-gray-300 my-8">
            No scores yet. Start playing to be the first on the leaderboard!
          </p> */}
          <p className="text-center text-gray-500 dark:text-gray-400 light:text-gray-300 my-8">
            raise NotImplementedError (later issue)
          </p>
        </div>
      </div>
    </main>
  );
}
