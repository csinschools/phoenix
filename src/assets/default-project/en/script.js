// initialising variable to keep track of button clicks
let numButtonClicks = 0;
// looking up the mainDiv and storing it in a constant variable for use in the buttonClicked handler function
const mainDiv = document.getElementById("mainDiv");

// this function gets called when the user clicks on the button
function buttonClicked() {
    // increment number of clicks
    numButtonClicks = numButtonClicks + 1;    
    // update text div in HTML file
    mainDiv.textContent = "Button Clicked times: " + numButtonClicks;
}
