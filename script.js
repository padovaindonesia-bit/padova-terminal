console.log("script.js loaded");

function showAttendance() {
    console.log("showAttendance()");
    document.getElementById("home").classList.remove("active");
    document.getElementById("attendance").classList.add("active");
}

function goHome() {
    console.log("goHome()");
    document.getElementById("attendance").classList.remove("active");
    document.getElementById("home").classList.add("active");
}
