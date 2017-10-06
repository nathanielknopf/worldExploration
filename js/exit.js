function param(param) { 
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
    var slides = {}

    slides.subj_info = slide({
        name: "subj_info",
        submit: function(){
            exp.subj_data = {
                language: $("#language").val(),
                enjoyment: $("#enjoyment").val(),
                assess: $('input[name="assess"]:checked').val(),
                age: $("#age").val(),
                gender: $("#gender").val(),
                education: $("#education").val(),
                comments: $("#comments").val(),
            };
            exp.go();
        }
    })

    slides.thanks = slide({
        name: "thanks",
        start: function(){
            console.log("End of survey reached.")
            console.log(exp.response)
            exp.data= {
                "system" : exp.system,
                "condition" : exp.condition,
                "question order" : exp.question_order,
                "supplement": exp.supplement,
                "score": exp.score,
                "responses" : exp.responses,
                "subject_information": exp.subj_data,
                "comprehension": exp.comprehension
            };
            setTimeout(function() {
                turk.submit(exp.data);
            }, 500)
        }
    })

    return slides
}

function init(){
    exp.user = (param('workerId') == '') ? 'undefined' : param('workerId')
    exp.condition = (param('condition') == '') ? 'a' : param('condition')
    exp.question_order = (param('qord') == '') ? 'q1' : param('qord') //'q1' or 'q2'
    exp.responses = ''
    exp.system = {
        Browser : BrowserDetect.browser,
        OS : BrowserDetect.OS,
        screenH: screen.height,
        screenUH: exp.height,
        screenW: screen.width,
        screenUW: exp.width
    }
    exp.structure = ["subj_info", "thanks"]

    exp.slides = make_slides(exp);

    $('.slide').hide(); //hide everything

    //make sure turkers have accepted HIT (or you're not in mturk)
    $("#start_button").click(function(){
        if(turk.previewMode){
            $("#mustaccept").show()
        }else{
            $("#start_button").click(function() {$("#mustaccept").show()})
            exp.go()
        }
    })
    exp.go()
}
