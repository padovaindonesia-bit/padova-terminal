alert("script.js loaded");

function showAttendance() {
    alert("showAttendance called");

    document.getElementById("home").classList.remove("active");
    document.getElementById("attendance").classList.add("active");
}

function goHome() {
    alert("goHome called");

    document.getElementById("attendance").classList.remove("active");
    document.getElementById("home").classList.add("active");
}
