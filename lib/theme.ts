// Runs before paint (inlined in <head>) so the saved theme applies without a flash. Dark is the brand default.
export const themeScript = `try{document.documentElement.classList.toggle("dark",localStorage.getItem("theme")!=="light")}catch(e){document.documentElement.classList.add("dark")}`;
