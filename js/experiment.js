function param( param ) { 
    param = param.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
    var regexS = "[\\?&]"+param+"=([^&#]*)"; 
    var regex = new RegExp( regexS ); 
    var tmpURL = window.location.href
    var results = regex.exec( tmpURL ); 
    console.log("param: " + param + ", URL: " + tmpURL)
    if( results == null ) { 
        return ""; 
    } else { 
        return results[1];    
    } 
}

function make_slides(f){
    var slides = {};
    
    slides.i0 = slide({
        name: "i0",
        start: function(){
            exp.startT = Date.now();
        }
    });

    slides.instructions = slide({
        name: "instructions",
    });

    slides.message = slide({
        name: "message",
        start: function(){
            if(exp.message){
                $(".prompt").html('The previous generation has left the following message to help you:', exp.message);
            }else{
                $(".prompt").html('Please click the button below to continue.')
            }
            $(".prompt").html('"' + exp.message + '"')
        },
        button: function(){
            exp.go();
        }
    });

    slides.login = slide({
        name: "login",
        start: function(){
            $(".redirecting").hide()
            $(".display_prompt").html("When you are ready, please click the button below to be redirected to the game.")
        },
        button: function(){
            var destination = '/game.html?condition=' + exp.condition + '&qord=' + exp.question_order + '&assignmentId=' + exp.assignmentId + '&hitID=' + exp.hitId + '&workerId=' + exp.workerId + '&turkSubmitTo=' + exp.turkSubmitTo;
            $(".redirecting").show()
            setTimeout(function(){
                window.location.href = destination;
            }, 500)
        }
    });

    return slides;
}

function init(){
    exp.system = {
        Browser : BrowserDetect.browser,
        OS : BrowserDetect.OS,
        screenH: screen.height,
        screenUH: exp.height,
        screenW: screen.width,
        screenUW: exp.width
    };
    exp.structure = ["i0", "instructions", "message", "login"];
    exp.assignmentId = param("assignmentId");
    exp.hitId = param("hitId");
    exp.workerId = param("workerId");
    exp.turkSubmitTo = param("turkSubmitTo");
    console.log("assignmentId: " + exp.assignmentId + " - hitId: " + exp.hitId + " - workerId: " + exp.workerId + " - turkSubmitTo: " + exp.turkSubmitTo);
    exp.slides = make_slides(exp);

    exp.nQs = utils.get_exp_length(); //this does not work if there are stacks of stims (but does work for an experiment with this structure)
                    //relies on structure and slides being defined

    $('.slide').hide(); //hide everything

    //make sure turkers have accepted HIT (or you're not in mturk)
    $("#start_button").click(function(){
        if(turk.previewMode){
            $("#mustaccept").show();
        }else{
            $("#start_button").click(function() {$("#mustaccept").show()});
            exp.go();
        };
    });
    exp.go();
};
